"""Sparandet av godkända förslag: POST /profile/interests/confirm och POST /profile/interview/complete."""

from datetime import datetime, timedelta, timezone

import pytest

from app.auth.security import create_access_token
from app.core.config import settings
from app.models.interest import Interest, InterestSource, InterestStatus
from app.models.profile import Profile
from app.models.user import User
from app.models.user_interest import UserInterest
from app.models.interest_embedding import EMBEDDING_DIMENSIONS, InterestEmbedding
from app.services.ai_clients import AIFailed, set_clients
from app.services.analysis_token import create_token
from app.services.interest_confirm import OWN_INTEREST_LIMIT
from tests.fakes import FakeEmbedder
from tests.helpers import make_profile

CONFIRM = "/profile/interests/confirm"
COMPLETE = "/profile/interview/complete"
SEAL_INVALID = "Förslagen är inte längre giltiga. Tolka texten igen."
TOO_MANY = "Du har lagt till många egna intressen i dag. Försök igen i morgon."
ALLOWED = ["lyssna", "spela", "skapa", "besoka"]


@pytest.fixture
def library(db):
    musik = Interest(name="Musik", slug="musik", activities=list(ALLOWED))
    skapande = Interest(name="Skapande", slug="skapande")
    db.add_all([musik, skapande])
    db.flush()
    metal = Interest(name="Metal", slug="metal", parent_id=musik.id)
    jazz = Interest(name="Jazz", slug="jazz", parent_id=musik.id)
    techno = Interest(name="Techno", slug="techno", parent_id=musik.id)
    db.add_all([metal, jazz, techno])
    db.commit()
    return {"musik": musik, "skapande": skapande, "metal": metal, "jazz": jazz, "techno": techno}


@pytest.fixture
def profile(db, user, municipalities):
    db.add(make_profile(user.id))
    db.commit()


def claim_same(key, interest, allowed=ALLOWED, activity=""):
    return {"key": key, "interest_id": interest.id, "activity": activity, "allowed": list(allowed)}


def claim_new(key, name, parent=None, parent_key=None, allowed=("skapa", "bygga")):
    new = {"name": name}
    if parent_key:
        new["parent_key"] = parent_key
    else:
        new["parent_id"] = parent.id
    return {"key": key, "new": new, "activity": "", "allowed": list(allowed)}


def batch(user, claims, items):
    return {"token": create_token(user.id, list(claims)), "items": items}


def confirm(client, *batches):
    return client.post(CONFIRM, json={"batches": list(batches)})


def rows(db, user_id):
    return sorted(
        (r.interest.name, r.activity, r.source)
        for r in db.query(UserInterest).filter(UserInterest.user_id == user_id).all()
    )


# ---------- Förslag som finns i biblioteket ----------


def test_an_approved_existing_interest_is_saved_with_the_chosen_activity(client, user, profile, library, db):
    response = confirm(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1", "activity": "spela"}]))
    assert response.status_code == 200
    assert response.json() == {"interests": [{"id": library["metal"].id, "name": "Metal", "activity": "spela", "label": None}]}
    assert rows(db, user.id) == [("Metal", "spela", "free_text")]


def test_no_activity_gives_one_row_without_activity(client, user, profile, library, db):
    confirm(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}]))
    assert rows(db, user.id) == [("Metal", "", "free_text")]


def test_several_activities_give_several_rows(client, user, profile, library, db):
    items = [{"key": "p1", "activities": ["lyssna", "spela"]}]
    response = confirm(client, batch(user, [claim_same("p1", library["metal"])], items))
    assert [(i["name"], i["activity"]) for i in response.json()["interests"]] == [("Metal", "lyssna"), ("Metal", "spela")]
    assert rows(db, user.id) == [("Metal", "lyssna", "free_text"), ("Metal", "spela", "free_text")]


def test_activity_and_activities_can_be_combined_without_duplicates(client, user, profile, library, db):
    items = [{"key": "p1", "activity": "spela", "activities": ["spela", "lyssna"]}]
    confirm(client, batch(user, [claim_same("p1", library["metal"])], items))
    assert [r[1] for r in rows(db, user.id)] == ["lyssna", "spela"]


def test_proposals_that_are_not_sent_are_dropped(client, user, profile, library, db):
    claims = [claim_same("p1", library["metal"]), claim_same("p2", library["jazz"])]
    confirm(client, batch(user, claims, [{"key": "p1"}]))
    assert [r[0] for r in rows(db, user.id)] == ["Metal"]


def test_sending_nothing_saves_nothing(client, user, profile, library, db):
    assert confirm(client, batch(user, [claim_same("p1", library["metal"])], [])).status_code == 200
    assert rows(db, user.id) == []


def test_an_activity_the_seal_does_not_allow_is_refused_and_nothing_is_saved(client, user, profile, library, db):
    response = confirm(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1", "activity": "samla"}]))
    assert response.status_code == 400 and response.json()["detail"] == "Den aktiviteten passar inte intresset"
    assert rows(db, user.id) == []


def test_a_key_that_is_not_in_the_seal_is_refused(client, user, profile, library, db):
    response = confirm(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p9"}]))
    assert response.status_code == 400 and response.json()["detail"] == "Okänt förslag"
    assert rows(db, user.id) == []


def test_an_interest_that_has_been_removed_since_the_analysis_is_refused(client, user, profile, library, db):
    library["metal"].status = InterestStatus.inactive.value
    db.commit()
    response = confirm(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}]))
    assert response.status_code == 400 and "finns inte längre" in response.json()["detail"]


def test_saving_the_same_thing_twice_does_not_duplicate_it(client, user, profile, library, db):
    first = batch(user, [claim_same("p1", library["metal"])], [{"key": "p1", "activity": "spela"}])
    confirm(client, first)
    confirm(client, first)
    assert rows(db, user.id) == [("Metal", "spela", "free_text")]


# ---------- Sigillet ----------


def test_a_changed_seal_is_refused_with_a_swedish_message(client, user, profile, library, db):
    good = batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}])
    good["token"] = good["token"][:-3] + "abc"
    response = confirm(client, good)
    assert response.status_code == 400 and response.json()["detail"] == SEAL_INVALID
    assert rows(db, user.id) == []


def test_an_expired_seal_is_refused(client, user, profile, library, monkeypatch):
    from app.services import analysis_token

    monkeypatch.setattr(analysis_token, "TOKEN_LIFETIME", timedelta(seconds=-5))
    response = confirm(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}]))
    assert response.status_code == 400 and response.json()["detail"] == SEAL_INVALID


def test_a_seal_made_for_someone_else_is_refused(client, user, profile, library, db):
    other = User(id=2, username="annan", password_hash="x")
    db.add(other)
    db.commit()
    response = confirm(client, batch(other, [claim_same("p1", library["metal"])], [{"key": "p1"}]))
    assert response.status_code == 400 and response.json()["detail"] == SEAL_INVALID


def test_a_login_token_is_not_a_seal(client, user, profile, library):
    response = confirm(client, {"token": create_access_token(user.id), "items": [{"key": "p1"}]})
    assert response.status_code == 400 and response.json()["detail"] == SEAL_INVALID


def test_a_seal_with_a_malformed_proposal_is_refused(client, user, profile, library):
    for bad in ({"key": "p1"}, {"key": "p1", "allowed": []}, {"key": 5, "allowed": [], "interest_id": 1}, "inte ett objekt"):
        response = confirm(client, {"token": create_token(user.id, [bad]), "items": [{"key": "p1"}]})
        assert response.status_code == 400, bad


def test_one_bad_batch_cancels_the_whole_request(client, user, profile, library, db):
    good = batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}])
    bad = {"token": "inte en token", "items": [{"key": "p1"}]}
    assert confirm(client, good, bad).status_code == 400
    assert rows(db, user.id) == []


def test_without_a_jwt_secret_nothing_is_saved(client, user, profile, library, db, monkeypatch):
    token = create_token(user.id, [claim_same("p1", library["metal"])])
    monkeypatch.setattr(settings, "jwt_secret", "")
    response = confirm(client, {"token": token, "items": [{"key": "p1"}]})
    assert response.status_code == 503
    assert rows(db, user.id) == []


# ---------- Flera svar på en gång ----------


def test_the_same_interest_from_two_answers_becomes_one(client, user, profile, library, db):
    one = batch(user, [claim_same("p1", library["metal"])], [{"key": "p1", "activity": "spela"}])
    two = batch(user, [claim_same("p1", library["metal"])], [{"key": "p1", "activity": "lyssna"}])
    confirm(client, one, two)
    assert rows(db, user.id) == [("Metal", "lyssna", "free_text"), ("Metal", "spela", "free_text")]


def test_a_general_row_is_not_kept_next_to_a_specific_one_from_another_answer(client, user, profile, library, db):
    general = batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}])
    specific = batch(user, [claim_same("p1", library["metal"])], [{"key": "p1", "activity": "spela"}])
    confirm(client, general, specific)
    assert [r[1] for r in rows(db, user.id)] == ["spela"]


def test_different_interests_from_different_answers_are_all_saved(client, user, profile, library, db):
    one = batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}])
    two = batch(user, [claim_same("p1", library["jazz"])], [{"key": "p1"}])
    confirm(client, one, two)
    assert [r[0] for r in rows(db, user.id)] == ["Jazz", "Metal"]


# ---------- Svar på en huvudområdesfråga ----------


def test_an_answer_to_the_area_question_replaces_the_area_with_the_chosen_interest(client, user, profile, library, db):
    items = [{"key": "p1", "narrow_to": [library["techno"].id]}]
    confirm(client, batch(user, [claim_same("p1", library["musik"])], items))
    assert [r[0] for r in rows(db, user.id)] == ["Techno"]  # Techno i stället för Musik


def test_several_chosen_interests_all_replace_the_area_and_share_the_activities(client, user, profile, library, db):
    items = [{"key": "p1", "narrow_to": [library["techno"].id, library["jazz"].id], "activities": ["spela"]}]
    confirm(client, batch(user, [claim_same("p1", library["musik"])], items))
    assert rows(db, user.id) == [("Jazz", "spela", "free_text"), ("Techno", "spela", "free_text")]


def test_answering_generally_keeps_the_area_itself(client, user, profile, library, db):
    confirm(client, batch(user, [claim_same("p1", library["musik"])], [{"key": "p1"}]))
    assert [r[0] for r in rows(db, user.id)] == ["Musik"]


def test_a_chosen_interest_that_is_not_below_the_proposal_is_refused(client, user, profile, library, db):
    response = confirm(client, batch(user, [claim_same("p1", library["musik"])], [{"key": "p1", "narrow_to": [library["skapande"].id]}]))
    assert response.status_code == 400 and response.json()["detail"] == "Det valet finns inte för intresset"
    assert rows(db, user.id) == []


def test_an_interest_that_does_not_exist_cannot_be_chosen(client, user, profile, library):
    response = confirm(client, batch(user, [claim_same("p1", library["musik"])], [{"key": "p1", "narrow_to": [99999]}]))
    assert response.status_code == 400


def test_an_answer_cannot_narrow_a_new_interest(client, user, profile, library):
    claims = [claim_new("p1", "Modellbygge", library["skapande"])]
    response = confirm(client, batch(user, claims, [{"key": "p1", "narrow_to": [library["techno"].id]}]))
    assert response.status_code == 400


# ---------- Egna intressen ----------


def new_interests(db, user_id=None):
    query = db.query(Interest).filter(Interest.source == InterestSource.ai.value)
    return query.all() if user_id is None else query.filter(Interest.created_by_user_id == user_id).all()


def test_new_interests_get_their_vectors_in_one_call_and_an_existing_one_gets_none(client, user, profile, library, db):
    embedder = FakeEmbedder()
    set_clients(embedder=embedder)
    claims = [
        claim_same("p1", library["musik"]),
        claim_new("p2", "Modellbygge", library["skapande"]),
        claim_new("p3", "Fyrmodeller", parent_key="p2"),
    ]
    response = confirm(client, batch(user, claims, [{"key": "p1"}, {"key": "p2"}, {"key": "p3"}]))
    assert response.status_code == 200
    assert embedder.calls == [["Modellbygge", "Fyrmodeller"]]  # ett anrop, och inte för Musik som redan fanns
    created = new_interests(db, user.id)
    assert len(created) == 2
    for interest in created:
        row = db.get(InterestEmbedding, interest.id)
        assert len(row.embedding) == EMBEDDING_DIMENSIONS and row.embedding_hash


def test_a_new_interest_is_saved_even_when_its_vector_cannot_be_calculated(client, user, profile, library, db):
    set_clients(embedder=FakeEmbedder(error=AIFailed("URLError")))
    response = confirm(client, batch(user, [claim_new("p1", "Modellbygge", library["skapande"])], [{"key": "p1"}]))
    assert response.status_code == 200
    (interest,) = new_interests(db, user.id)
    assert interest.name == "Modellbygge" and db.get(InterestEmbedding, interest.id) is None  # nästa synk fyller i den
    assert len(rows(db, user.id)) == 1  # och det ligger på profilen


def test_a_new_interest_is_created_under_its_parent_with_its_creator_and_shows_on_the_profile(client, user, profile, library, db):
    claims = [claim_new("p1", "Besöka återvinningscentraler", library["skapande"])]
    response = confirm(client, batch(user, claims, [{"key": "p1"}]))
    assert response.status_code == 200
    (created,) = new_interests(db)
    assert (created.name, created.parent_id, created.created_by_user_id) == ("Besöka återvinningscentraler", library["skapande"].id, user.id)
    assert (created.status, created.source, created.slug) == ("active", "ai", None)
    assert [i["name"] for i in response.json()["interests"]] == ["Besöka återvinningscentraler"]
    assert rows(db, user.id) == [("Besöka återvinningscentraler", "", "free_text")]


def test_a_new_interest_is_active_so_it_can_be_used_in_matching_right_away(client, user, profile, library, db):
    from app.crud.interest import load_library_index

    confirm(client, batch(user, [claim_new("p1", "Besöka återvinningscentraler", library["skapande"])], [{"key": "p1"}]))
    assert "Besöka återvinningscentraler" in [i.name for i in load_library_index(db).items]


def test_a_new_interest_gets_its_own_activities_only_when_they_differ_from_what_it_inherits(client, user, profile, library, db):
    confirm(client, batch(user, [claim_new("p1", "Fyrmodeller", library["skapande"], allowed=("skapa", "samla"))], [{"key": "p1"}]))
    confirm(client, batch(user, [claim_new("p1", "Hårdrocksband", library["musik"], allowed=ALLOWED)], [{"key": "p1"}]))
    by_name = {i.name: i for i in new_interests(db)}
    assert by_name["Fyrmodeller"].activities == ["skapa", "samla"]  # Skapande har ingen lista
    assert by_name["Hårdrocksband"].activities is None  # samma som Musik, så den ärvs


def test_an_activity_on_a_new_interest_must_be_allowed_by_the_seal(client, user, profile, library, db):
    claims = [claim_new("p1", "Fyrmodeller", library["skapande"], allowed=("skapa",))]
    assert confirm(client, batch(user, claims, [{"key": "p1", "activity": "spela"}])).status_code == 400
    assert new_interests(db) == []


def test_an_existing_interest_with_the_same_name_under_the_same_parent_is_reused(client, user, profile, library, db):
    # Någon annan skapade det i mellantiden, eller det fanns redan med andra ord: båda får samma intresse.
    existing = Interest(name="Besöka återvinningscentraler", parent_id=library["skapande"].id, source=InterestSource.ai.value)
    db.add(existing)
    db.commit()
    confirm(client, batch(user, [claim_new("p1", "besöka återvinningscentraler", library["skapande"])], [{"key": "p1"}]))
    assert len(new_interests(db)) == 1
    assert rows(db, user.id) == [("Besöka återvinningscentraler", "", "free_text")]


def test_the_same_name_under_another_parent_is_a_different_interest(client, user, profile, library, db):
    db.add(Interest(name="Mix", parent_id=library["musik"].id, source=InterestSource.ai.value))
    db.commit()
    confirm(client, batch(user, [claim_new("p1", "Mix", library["skapande"])], [{"key": "p1"}]))
    assert len(new_interests(db)) == 2


def test_two_answers_with_the_same_new_interest_create_it_once(client, user, profile, library, db):
    one = batch(user, [claim_new("p1", "Fyrmodeller", library["skapande"])], [{"key": "p1", "activity": "skapa"}])
    two = batch(user, [claim_new("p1", "fyrmodeller", library["skapande"])], [{"key": "p1", "activity": "bygga"}])
    confirm(client, one, two)
    assert len(new_interests(db)) == 1
    assert rows(db, user.id) == [("Fyrmodeller", "bygga", "free_text"), ("Fyrmodeller", "skapa", "free_text")]


def test_the_same_new_sub_from_two_answers_under_the_same_new_parent_is_created_once(client, user, profile, library, db):
    def answer():
        claims = [claim_new("p1", "Modellbygge", library["skapande"]), claim_new("p2", "Fyrmodeller", parent_key="p1")]
        return batch(user, claims, [{"key": "p2"}])

    confirm(client, answer(), answer())
    assert sorted(i.name for i in new_interests(db)) == ["Fyrmodeller", "Modellbygge"]
    assert [r[0] for r in rows(db, user.id)] == ["Fyrmodeller"]


def test_a_sub_under_a_new_interest_creates_both_in_the_right_order(client, user, profile, library, db):
    claims = [claim_new("p1", "Modellbygge", library["skapande"]), claim_new("p2", "Fyrmodeller", parent_key="p1")]
    response = confirm(client, batch(user, claims, [{"key": "p1"}, {"key": "p2"}]))
    assert response.status_code == 200
    modellbygge = db.query(Interest).filter_by(name="Modellbygge").one()
    fyrmodeller = db.query(Interest).filter_by(name="Fyrmodeller").one()
    assert modellbygge.parent_id == library["skapande"].id and fyrmodeller.parent_id == modellbygge.id
    assert [i["name"] for i in response.json()["interests"]] == ["Fyrmodeller", "Modellbygge"]


def test_approving_only_the_sub_still_creates_its_new_parent_but_only_links_the_sub(client, user, profile, library, db):
    claims = [claim_new("p1", "Modellbygge", library["skapande"]), claim_new("p2", "Fyrmodeller", parent_key="p1")]
    confirm(client, batch(user, claims, [{"key": "p2"}]))
    assert {i.name for i in new_interests(db)} == {"Modellbygge", "Fyrmodeller"}
    assert [r[0] for r in rows(db, user.id)] == ["Fyrmodeller"]


def test_approving_only_the_parent_does_not_create_the_sub(client, user, profile, library, db):
    claims = [claim_new("p1", "Modellbygge", library["skapande"]), claim_new("p2", "Fyrmodeller", parent_key="p1")]
    confirm(client, batch(user, claims, [{"key": "p1"}]))
    assert [i.name for i in new_interests(db)] == ["Modellbygge"]


def test_a_sub_whose_parent_is_missing_from_the_seal_is_refused(client, user, profile, library, db):
    response = confirm(client, batch(user, [claim_new("p2", "Fyrmodeller", parent_key="p1")], [{"key": "p2"}]))
    assert response.status_code == 400 and new_interests(db) == []


def test_a_cycle_in_the_parent_chain_is_refused(client, user, profile, library, db):
    claims = [claim_new("p1", "A", parent_key="p2"), claim_new("p2", "B", parent_key="p1")]
    assert confirm(client, batch(user, claims, [{"key": "p1"}])).status_code == 400
    assert new_interests(db) == []


def test_a_new_interest_cannot_be_deeper_than_three_levels(client, user, profile, library, db):
    deep = Interest(name="Underintresse", parent_id=library["metal"].id)  # nivå 3
    db.add(deep)
    db.commit()
    response = confirm(client, batch(user, [claim_new("p1", "Ännu djupare", deep)], [{"key": "p1"}]))
    assert response.status_code == 400 and new_interests(db) == []


@pytest.mark.parametrize("name", ["A", " ", "x" * 61, "fuck", "Besöka fuck-ställen"])
def test_a_name_that_is_too_short_too_long_or_rude_is_refused(client, user, profile, library, db, name):
    response = confirm(client, batch(user, [claim_new("p1", name, library["skapande"])], [{"key": "p1"}]))
    assert response.status_code == 400 and response.json()["detail"] == "Namnet på det nya intresset är inte tillåtet"
    assert new_interests(db) == [] and rows(db, user.id) == []


@pytest.mark.parametrize("name", ["Ab", "x" * 60, "Besöka återvinningscentraler"])
def test_names_between_two_and_sixty_characters_are_accepted(client, user, profile, library, db, name):
    assert confirm(client, batch(user, [claim_new("p1", name, library["skapande"])], [{"key": "p1"}])).status_code == 200


# ---------- Gränsen på egna intressen ----------


def own_interests(db, user_id, count, hours_ago=0):
    created = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    parent = db.query(Interest).filter_by(slug="skapande").one()
    db.add_all(
        Interest(name=f"Eget {user_id}-{hours_ago}-{i}", parent_id=parent.id, source=InterestSource.ai.value, created_by_user_id=user_id, created_at=created)
        for i in range(count)
    )
    db.commit()


def test_the_twentieth_own_interest_in_a_day_is_allowed_and_the_twenty_first_is_not(client, user, profile, library, db):
    own_interests(db, user.id, OWN_INTEREST_LIMIT - 1)
    assert confirm(client, batch(user, [claim_new("p1", "Tjugonde", library["skapande"])], [{"key": "p1"}])).status_code == 200
    response = confirm(client, batch(user, [claim_new("p1", "Tjugoförsta", library["skapande"])], [{"key": "p1"}]))
    assert response.status_code == 429 and response.json()["detail"] == TOO_MANY
    assert db.query(Interest).filter_by(name="Tjugoförsta").count() == 0


def test_all_new_interests_in_one_request_count_together(client, user, profile, library, db):
    own_interests(db, user.id, OWN_INTEREST_LIMIT - 1)
    claims = [claim_new("p1", "Ett", library["skapande"]), claim_new("p2", "Två", library["skapande"])]
    response = confirm(client, batch(user, claims, [{"key": "p1"}, {"key": "p2"}]))
    assert response.status_code == 429
    assert db.query(Interest).filter(Interest.name.in_(["Ett", "Två"])).count() == 0  # allt eller inget


def test_an_implicitly_created_parent_counts_too(client, user, profile, library, db):
    own_interests(db, user.id, OWN_INTEREST_LIMIT - 1)
    claims = [claim_new("p1", "Modellbygge", library["skapande"]), claim_new("p2", "Fyrmodeller", parent_key="p1")]
    assert confirm(client, batch(user, claims, [{"key": "p2"}])).status_code == 429


def test_own_interests_older_than_a_day_do_not_count(client, user, profile, library, db):
    own_interests(db, user.id, OWN_INTEREST_LIMIT, hours_ago=25)
    assert confirm(client, batch(user, [claim_new("p1", "Nytt", library["skapande"])], [{"key": "p1"}])).status_code == 200


def test_other_users_own_interests_do_not_count(client, user, profile, library, db):
    other = User(id=2, username="annan", password_hash="x")
    db.add(other)
    db.commit()
    own_interests(db, other.id, OWN_INTEREST_LIMIT)
    assert confirm(client, batch(user, [claim_new("p1", "Nytt", library["skapande"])], [{"key": "p1"}])).status_code == 200


def test_reusing_an_existing_interest_does_not_count_and_works_at_the_limit(client, user, profile, library, db):
    own_interests(db, user.id, OWN_INTEREST_LIMIT)
    db.add(Interest(name="Redan finns", parent_id=library["skapande"].id, source=InterestSource.ai.value))
    db.commit()
    assert confirm(client, batch(user, [claim_new("p1", "Redan finns", library["skapande"])], [{"key": "p1"}])).status_code == 200


def test_existing_interests_can_still_be_saved_at_the_limit(client, user, profile, library, db):
    own_interests(db, user.id, OWN_INTEREST_LIMIT)
    assert confirm(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}])).status_code == 200


# ---------- Övrigt ----------


def test_a_user_without_a_profile_cannot_confirm_interests(client, user, library):
    assert confirm(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}])).status_code == 404


def test_login_is_required(client, library):
    assert client.post(CONFIRM, json={"batches": []}).status_code == 401
    assert client.post(COMPLETE, json={}).status_code == 401


@pytest.mark.parametrize("body", [{}, {"batches": []}, {"batches": [{"token": "", "items": []}]}, {"batches": "x"}])
def test_a_malformed_request_is_rejected(client, user, profile, body):
    assert client.post(CONFIRM, json=body).status_code == 422


def test_too_many_batches_or_items_are_rejected(client, user, profile, library):
    token = create_token(user.id, [claim_same("p1", library["metal"])])
    assert client.post(CONFIRM, json={"batches": [{"token": token, "items": []}] * 11}).status_code == 422
    assert client.post(CONFIRM, json={"batches": [{"token": token, "items": [{"key": "p1"}] * 31}]}).status_code == 422


def test_label_is_never_written(client, user, profile, library, db):
    confirm(client, batch(user, [{**claim_same("p1", library["metal"]), "label": "spelar i band"}], [{"key": "p1", "label": "något annat"}]))
    assert db.query(UserInterest).one().label is None


# ---------- En helt ny profil ----------

PROFILE = {"name": "Nicklas", "birth_date": "1990-01-01", "gender": "man", "municipality_code": "1480", "profile_text": "Jag är snäll."}


def complete(client, *batches, **overrides):
    return client.post(COMPLETE, json={**PROFILE, "batches": list(batches), **overrides})


def test_a_new_profile_and_its_interests_are_created_together(client, user, municipalities, library, db):
    items = [{"key": "p1", "activity": "spela"}, {"key": "p2"}]
    claims = [claim_same("p1", library["metal"]), claim_new("p2", "Fyrmodeller", library["skapande"])]
    response = complete(client, batch(user, claims, items))
    assert response.status_code == 201
    body = response.json()
    assert body["profile"]["name"] == "Nicklas" and body["profile"]["municipality_name"] == "Göteborg"
    assert [(i["name"], i["activity"]) for i in body["interests"]] == [("Fyrmodeller", ""), ("Metal", "spela")]
    assert db.query(Profile).filter_by(user_id=user.id).one().name == "Nicklas"
    assert rows(db, user.id) == [("Fyrmodeller", "", "onboarding"), ("Metal", "spela", "onboarding")]


def test_completing_the_interview_marks_the_user_as_done(client, user, municipalities, library, db):
    assert db.get(User, user.id).onboarding_completed_at is None
    complete(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}]))
    assert db.get(User, user.id).onboarding_completed_at is not None


def test_no_approved_interest_means_no_profile(client, user, municipalities, library, db):
    response = complete(client, batch(user, [claim_same("p1", library["metal"])], []))
    assert response.status_code == 422 and response.json()["detail"] == "Välj minst ett intresse"
    assert db.query(Profile).count() == 0 and rows(db, user.id) == []
    assert db.get(User, user.id).onboarding_completed_at is None


def test_a_bad_seal_means_no_profile(client, user, municipalities, library, db):
    response = complete(client, {"token": "inte en token", "items": [{"key": "p1"}]})
    assert response.status_code == 400 and response.json()["detail"] == SEAL_INVALID
    assert db.query(Profile).count() == 0


def test_the_limit_on_own_interests_also_stops_the_profile(client, user, municipalities, library, db):
    own_interests(db, user.id, OWN_INTEREST_LIMIT)
    response = complete(client, batch(user, [claim_new("p1", "Nytt", library["skapande"])], [{"key": "p1"}]))
    assert response.status_code == 429
    assert db.query(Profile).count() == 0 and db.query(Interest).filter_by(name="Nytt").count() == 0


def test_an_existing_profile_gives_409(client, user, profile, library):
    response = complete(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}]))
    assert response.status_code == 409


def test_an_unknown_municipality_gives_422_and_saves_nothing(client, user, municipalities, library, db):
    response = complete(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}]), municipality_code="0000")
    assert response.status_code == 422 and db.query(Profile).count() == 0 and rows(db, user.id) == []


def test_the_about_me_text_is_checked_before_anything_is_saved(client, user, municipalities, library, db):
    response = complete(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}]), profile_text="Jag är pedofil.")
    assert response.status_code == 422
    assert db.query(Profile).count() == 0 and rows(db, user.id) == []


@pytest.mark.parametrize("override", [{"name": ""}, {"birth_date": "2999-01-01"}, {"profile_text": ""}, {"gender": "okänt"}])
def test_the_profile_fields_are_validated_like_in_the_normal_profile_endpoint(client, user, municipalities, library, override):
    response = complete(client, batch(user, [claim_same("p1", library["metal"])], [{"key": "p1"}]), **override)
    assert response.status_code == 422


# ---------- Hela kedjan: analys, godkännande, sparande ----------


def analyze_with_fakes(client, library):
    """Kör POST /interests/analyze med falska modeller och ger svaret."""
    from app.services.ai_clients import set_clients
    from tests.fakes import FakeLLM, FakeModerator

    tree = {
        "interests": [
            {"name": "hårdrock", "aliases": [], "subtags": []},
            {"name": "modellbygge", "aliases": [], "subtags": [{"name": "fyrmodeller", "aliases": []}]},
        ]
    }
    match = {
        "decisions": [
            {"key": "t2", "decision": "new", "interest_id": None, "parent_id": library["skapande"].id, "new_name": "modellbygge"},
            {"key": "t3", "decision": "new", "interest_id": None, "parent_id": None, "new_name": None},
        ]
    }
    decisions = [
        {"key": k, "activity": a, "suggested_activities": sug, "ask": "none", "question": "", "interest_options": [], "activity_options": []}
        for k, a, sug in [("t1", "spela", []), ("t2", "", ["skapa", "samla"]), ("t3", "", [])]
    ]
    llm = FakeLLM(
        {
            "interests": tree,
            "judge": {"remove": []},
            "match": match,
            "clarify": {"decisions": decisions},
            "activities": {"suggestions": []},
            "text_policy": {"allowed": True},  # kontrollen av Om mig-texten när profilen skapas
        }
    )
    set_clients(llm=llm, moderator=FakeModerator())
    return client.post("/interests/analyze", json={"text": "Jag spelar hårdrock i ett band och bygger fyrmodeller."})


def test_the_whole_chain_from_analysis_to_a_saved_profile(client, user, municipalities, library, db, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "test-nyckel")
    monkeypatch.setattr(settings, "openai_model", "test-modell")
    library["metal"].aliases = "hårdrock"
    db.commit()
    analysis = analyze_with_fakes(client, library)
    assert analysis.status_code == 200, analysis.text
    body = analysis.json()
    assert [p["interest"]["name"] for p in body["proposals"]] == ["Metal", "Modellbygge", "Fyrmodeller"]

    approved = [{"key": p["key"], "activity": p["activity"]} for p in body["proposals"]]
    response = complete(client, {"token": body["token"], "items": approved})
    assert response.status_code == 201, response.text
    assert rows(db, user.id) == [
        ("Fyrmodeller", "", "onboarding"),
        ("Metal", "spela", "onboarding"),
        ("Modellbygge", "", "onboarding"),
    ]
    modellbygge = db.query(Interest).filter_by(name="Modellbygge").one()
    assert db.query(Interest).filter_by(name="Fyrmodeller").one().parent_id == modellbygge.id
    assert modellbygge.parent_id == library["skapande"].id and modellbygge.created_by_user_id == user.id


def test_the_whole_chain_with_only_the_sub_approved_by_the_user(client, user, profile, library, db, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "test-nyckel")
    monkeypatch.setattr(settings, "openai_model", "test-modell")
    library["metal"].aliases = "hårdrock"
    db.commit()
    body = analyze_with_fakes(client, library).json()
    sub = next(p for p in body["proposals"] if p["interest"]["name"] == "Fyrmodeller")
    response = confirm(client, {"token": body["token"], "items": [{"key": sub["key"]}]})
    assert response.status_code == 200
    assert {i.name for i in new_interests(db)} == {"Modellbygge", "Fyrmodeller"}  # föräldern skapas ändå
    assert [r[0] for r in rows(db, user.id)] == ["Fyrmodeller"]
