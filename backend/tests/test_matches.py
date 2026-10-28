"""GET /matches (api/routes/matches.py och services/match_suggestions.py): vilka som föreslås, i vilken ordning och vilka som aldrig
gör det. Vektorerna är påhittade och korta (SQLite lagrar dem som JSON), och poängens formel testas i test_matching.py."""

from datetime import date, timedelta

import pytest

from app.models.profile import GenderEnum
from app.models.user_interest import PRACTISES
from app.models import Contact, DismissedSuggestion, Interest, ProfileEmbedding, User, UserInterest
from app.models.interest_embedding import InterestEmbedding
from app.services.interest_embeddings import text_hash
from tests.helpers import make_profile

CLIMBING, MUSIC = [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]
TEXT = "Jag älskar att klättra och vandra och söker någon att göra det med på helgerna, gärna med tält. " * 2  # över 100 tecken


def _interest(db, name, parent=None, vector=CLIMBING):
    interest = Interest(name=name, slug=name.lower(), activities=[], parent_id=parent.id if parent else None)
    db.add(interest)
    db.commit()
    db.add(InterestEmbedding(interest_id=interest.id, embedding=vector, embedding_hash="x"))
    db.commit()
    return interest


def _fill_profile(db, person, interests, text=TEXT, vector=CLIMBING, name=None):
    """Ger en användare en profil, intressen och (om vector inte är None) en vektor för Om mig-texten."""
    profile = make_profile(person.id, name=name or person.username.title(), profile_text=text)
    db.add(profile)
    db.commit()
    for interest in interests:
        db.add(UserInterest(user_id=person.id, interest_id=interest.id))
    if vector is not None:
        db.add(ProfileEmbedding(profile_id=profile.id, embedding=vector, embedding_hash=text_hash(text.strip())))
    db.commit()
    return person


def _person(db, username, interests, **kwargs):
    person = User(username=username, password_hash="unused")
    db.add(person)
    db.commit()
    return _fill_profile(db, person, interests, **kwargs)


@pytest.fixture
def climbing(db):
    """Tre intressen i klättringsgrenen (Friluftsliv) och tre i musikgrenen, med vektorer."""
    outdoors = _interest(db, "Friluftsliv")
    return [_interest(db, name, parent=outdoors) for name in ("Bouldering", "Sportklattring", "Vandring")]


@pytest.fixture
def music(db):
    return [_interest(db, name, vector=MUSIC) for name in ("Jazz", "Opera", "Kor")]


def _matches(client, **params):
    response = client.get("/matches", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_someone_with_too_little_gets_no_suggestions_and_is_told_what_is_missing(client, db, user, climbing):
    _fill_profile(db, user, climbing[:1], text="Kort.")

    body = _matches(client)

    assert body["status"] == "not_ready"
    assert body["matches"] == []
    assert body["missing_interests"] == 2
    assert body["missing_chars"] == 100 - len("Kort.")


def test_best_match_comes_first_and_weak_ones_are_left_out(client, db, user, climbing, music):
    _fill_profile(db, user, climbing)
    _person(db, "twin", climbing, name="Twin")
    _person(db, "partly", [climbing[0], music[0], music[1]], name="Partly", vector=[0.8, 0.6, 0.0])
    _person(db, "opposite", music, name="Opposite", vector=MUSIC)

    body = _matches(client)

    assert body["status"] == "ok"
    names = [m["name"] for m in body["matches"]]
    assert names[0] == "Twin"
    assert "Opposite" not in names
    percents = [m["percent"] for m in body["matches"]]
    assert percents == sorted(percents, reverse=True)
    assert all(p >= 15 for p in percents)
    twin = body["matches"][0]
    assert twin["percent"] >= 90
    assert twin["level"] == "super"
    assert {m["level"] for m in body["matches"]} <= {"super", "strong", "good", "okay"}
    assert twin["shared_interests"] == ["Bouldering", "Sportklattring", "Vandring"]
    assert twin["low_confidence"] is True  # tre intressen är färre än fem


def test_a_match_is_not_marked_uncertain_when_both_have_plenty(client, db, user):
    outdoors = _interest(db, "Friluftsliv")
    many = [_interest(db, f"Klattring{n}", parent=outdoors) for n in range(5)]
    long_text = TEXT * 2  # över 200 tecken
    _fill_profile(db, user, many, text=long_text)
    _person(db, "twin", many, text=long_text, name="Twin")

    assert _matches(client)["matches"][0]["low_confidence"] is False


def test_people_who_cannot_be_matched_are_not_suggested(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    _person(db, "fewinterests", climbing[:2], name="FewInterests")
    _person(db, "shorttext", climbing, text="Kort text.", name="ShortText")
    _person(db, "ok", climbing, name="Ok")

    assert [m["name"] for m in _matches(client)["matches"]] == ["Ok"]


def test_nobody_is_suggested_twice_or_against_their_wish(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    dismissed, blocked, contact, asked, asking = (
        _person(db, name.lower(), climbing, name=name) for name in ("Dismissed", "Blocked", "Contact", "Asked", "Asking")
    )
    _person(db, "free", climbing, name="Free")
    db.add(DismissedSuggestion(user_id=user.id, dismissed_user_id=dismissed.id))
    db.add(Contact(requester_id=blocked.id, addressee_id=user.id, pair_key=f"{user.id}-{blocked.id}", status="BLOCKED"))
    db.add(Contact(requester_id=user.id, addressee_id=contact.id, pair_key=f"{user.id}-{contact.id}", status="ACCEPTED"))
    db.add(Contact(requester_id=user.id, addressee_id=asked.id, pair_key=f"{user.id}-{asked.id}", status="PENDING"))
    db.add(Contact(requester_id=asking.id, addressee_id=user.id, pair_key=f"{user.id}-{asking.id}", status="PENDING"))
    db.commit()

    assert [m["name"] for m in _matches(client)["matches"]] == ["Free"]


def test_pages_continue_where_the_last_one_stopped(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    for number in range(3):
        _person(db, f"twin{number}", climbing, name=f"Twin{number}")

    first = _matches(client, limit=2)
    second = _matches(client, limit=2, offset=2)

    assert len(first["matches"]) == 2 and first["has_more"] is True
    assert len(second["matches"]) == 1 and second["has_more"] is False
    assert {m["name"] for m in first["matches"] + second["matches"]} == {"Twin0", "Twin1", "Twin2"}


def test_a_text_vector_that_belongs_to_an_old_text_counts_as_missing(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    other = _person(db, "stale", climbing, name="Stale")
    db.query(ProfileEmbedding).filter(ProfileEmbedding.profile_id == other.profile.id).update({"embedding_hash": "old"})
    db.commit()

    match = _matches(client)["matches"][0]

    assert match["low_confidence"] is True  # texten saknar en aktuell vektor, så poängen bygger bara på intressena


def test_the_list_is_seen_from_the_one_asking_so_covering_all_my_interests_ranks_higher_for_me(client, db, user, climbing, music):
    from app.auth.security import get_current_user
    from app.main import app

    _fill_profile(db, user, climbing)  # tre intressen
    broad = _person(db, "broad", climbing + music, name="Broad")  # har alla mina och tre till

    mine = _matches(client)["matches"][0]
    app.dependency_overrides[get_current_user] = lambda: broad
    theirs = next(m for m in _matches(client)["matches"] if m["name"] == user.username.title())

    assert mine["percent"] > theirs["percent"]


def test_a_hidden_age_is_not_sent_to_the_one_looking(client, db, user, climbing):
    """Dölj åldern (SCRUM-134): kortet i förslagen får inte avslöja en ålder som personen har dolt."""
    _fill_profile(db, user, climbing)
    hidden = _person(db, "hidden", climbing, name="Hidden")
    shown = _person(db, "shown", climbing, name="Shown")
    hidden.profile.age_hidden = True
    db.commit()

    by_name = {m["name"]: m for m in _matches(client)["matches"]}

    assert by_name["Hidden"]["age"] is None
    assert by_name["Hidden"]["age_hidden"] is False  # den som tittar får inte veta att den är dold
    assert by_name["Shown"]["age"] is not None


def _names(client, **params):
    return {m["name"] for m in _matches(client, **params)["matches"]}


def _born_years_ago(years):
    today = date.today()
    return today.replace(year=today.year - years) - timedelta(days=30)  # en månad över, så att födelsedagen inte spelar in


def test_suggestions_can_be_limited_to_a_municipality(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    _person(db, "local", climbing, name="Local")
    far = _person(db, "far", climbing, name="Far")
    far.profile.municipality_code = "0180"
    db.commit()

    assert _names(client) == {"Local", "Far"}
    assert _names(client, municipality_code="0180") == {"Far"}


def test_a_gender_filter_only_finds_those_who_chose_to_be_found_on_gender(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    findable = _person(db, "findable", climbing, name="Findable")
    private = _person(db, "private", climbing, name="Private")
    other = _person(db, "other", climbing, name="Other")
    for person, gender, searchable in ((findable, GenderEnum.kvinna, True), (private, GenderEnum.kvinna, False), (other, GenderEnum.man, True)):
        person.profile.gender = gender
        person.profile.gender_searchable = searchable
    db.commit()

    assert _names(client, gender="kvinna") == {"Findable"}  # Private syns inte, annars avslöjar filtret könet


def test_an_age_filter_leaves_out_hidden_ages_and_both_ends_count(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    ages = {"Young": 22, "Middle": 30, "Old": 45, "Hidden": 30}
    for name, age in ages.items():
        person = _person(db, name.lower(), climbing, name=name)
        person.profile.birth_date = _born_years_ago(age)
        person.profile.age_hidden = name == "Hidden"
    db.commit()

    assert _names(client) == set(ages)
    assert _names(client, min_age=25) == {"Middle", "Old"}
    assert _names(client, max_age=30) == {"Young", "Middle"}
    assert _names(client, min_age=22, max_age=30) == {"Young", "Middle"}  # Hidden syns inte när man filtrerar på ålder


def test_a_minimum_age_above_the_maximum_is_refused(client, db, user, climbing):
    _fill_profile(db, user, climbing)

    response = client.get("/matches", params={"min_age": 40, "max_age": 30})

    assert response.status_code == 400
    assert client.get("/matches", params={"min_age": 130}).status_code == 422


def test_a_persons_score_is_the_same_with_and_without_a_filter(client, db, user, climbing, music):
    """Filtret väljer bara vilka som kan föreslås: poängen räknas per par och påverkas inte av vilka andra som finns."""
    _fill_profile(db, user, climbing)
    _person(db, "same", climbing, name="Same")
    partial = _person(db, "partial", climbing[:1] + music[:2], name="Partial")
    partial.profile.municipality_code = "0180"
    db.commit()

    everyone = {m["name"]: m["percent"] for m in _matches(client)["matches"]}
    filtered = {m["name"]: m["percent"] for m in _matches(client, municipality_code="0180")["matches"]}

    assert set(filtered) == {"Partial"}
    assert filtered["Partial"] == everyone["Partial"]


def test_pages_of_a_filtered_list_continue_where_the_last_one_stopped(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    for i in range(3):
        _person(db, f"far{i}", climbing, name=f"Far{i}").profile.municipality_code = "0180"
    _person(db, "local", climbing, name="Local")
    db.commit()

    first = _matches(client, municipality_code="0180", limit=2)
    second = _matches(client, municipality_code="0180", limit=2, offset=2)

    assert len(first["matches"]) == 2 and first["has_more"] is True
    assert len(second["matches"]) == 1 and second["has_more"] is False


def _reasons(client, name):
    match = next(m for m in _matches(client)["matches"] if m["name"] == name)
    return {r["kind"]: r for r in match["reasons"]}


def test_a_suggestion_says_which_interests_you_share_and_that_the_texts_are_alike(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    _person(db, "twin", climbing, name="Twin")

    reasons = _reasons(client, "Twin")

    assert reasons["shared"]["interests"] == ["Bouldering", "Sportklattring", "Vandring"]
    assert "text" in reasons
    assert "area" not in reasons  # delade intressen förklarar redan, så ingen "område"


def test_similar_but_different_interests_are_explained_as_near_pairs(client, db, user, climbing):
    outdoors = db.get(Interest, climbing[0].parent_id)
    other = [_interest(db, name, parent=outdoors) for name in ("Isklattring", "Klatterkurs", "Via ferrata")]
    _fill_profile(db, user, climbing)
    _person(db, "neighbour", other, name="Neighbour")

    reasons = _reasons(client, "Neighbour")

    assert "shared" not in reasons
    pairs = reasons["near"]["pairs"]
    assert 1 <= len(pairs) <= 2
    assert {p["mine"] for p in pairs} <= {"Bouldering", "Sportklattring", "Vandring"}
    assert {p["theirs"] for p in pairs} <= {"Isklattring", "Klatterkurs", "Via ferrata"}


def test_a_shared_area_is_the_reason_only_when_nothing_closer_exists(client, db, user, climbing):
    outdoors = db.get(Interest, climbing[0].parent_id)
    far = [_interest(db, name, parent=outdoors, vector=MUSIC) for name in ("Skidor", "Fiske", "Jakt")]
    _fill_profile(db, user, climbing)
    _person(db, "sameareaonly", far, name="AreaOnly")  # samma huvudområde, men intressen som inte liknar och texten lik

    reasons = _reasons(client, "AreaOnly")

    assert "shared" not in reasons and "near" not in reasons
    assert reasons["area"]["interests"] == ["Friluftsliv"]


def test_interests_you_both_practise_are_a_reason(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    twin = _person(db, "twin", climbing, name="Twin")
    for person in (user, twin):
        db.query(UserInterest).filter(UserInterest.user_id == person.id, UserInterest.interest_id == climbing[0].id).update({"activity": PRACTISES})
    db.commit()

    assert _reasons(client, "Twin")["practices"]["interests"] == ["Bouldering"]


def test_at_most_three_reasons_and_the_text_is_left_out_when_the_texts_differ(client, db, user, climbing):
    _fill_profile(db, user, climbing)
    twin = _person(db, "twin", climbing, name="Twin", vector=MUSIC)  # texten ligger långt från min
    db.query(UserInterest).filter(UserInterest.user_id == user.id).update({"activity": PRACTISES})
    db.query(UserInterest).filter(UserInterest.user_id == twin.id).update({"activity": PRACTISES})
    db.commit()

    match = next(m for m in _matches(client)["matches"] if m["name"] == "Twin")

    assert [r["kind"] for r in match["reasons"]] == ["shared", "practices"]
    assert len(match["reasons"]) <= 3
    assert "percent" not in str(match["reasons"])  # inga poäng i skälen
