"""GET /matches (api/routes/matches.py och services/match_suggestions.py): vilka som föreslås, i vilken ordning och vilka som aldrig
gör det. Vektorerna är påhittade och korta (SQLite lagrar dem som JSON), och poängens formel testas i test_matching.py."""

import pytest

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
