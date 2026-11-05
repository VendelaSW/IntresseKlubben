import pytest

from app.models import Interest
from tests.helpers import profile_payload


@pytest.fixture
def interests(db):
    # Läggs in i en annan ordning än bokstavsordning, så att sorteringen testas.
    items = [Interest(name="Yoga"), Interest(name="Brädspel"), Interest(name="Klättring")]
    db.add_all(items)
    db.commit()
    return {i.name: i.id for i in items}


def _names(response):
    return [i["name"] for i in response.json()]


def test_list_interests_is_sorted_by_name(client, interests):
    response = client.get("/interests/")
    assert response.status_code == 200
    assert _names(response) == ["Brädspel", "Klättring", "Yoga"]


def test_new_user_has_no_interests(client, user, interests):
    response = client.get("/profile/interests")
    assert response.status_code == 200
    assert response.json() == []


def test_add_interests_and_get_them_back(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")
    response = client.put(f"/profile/interests/{interests['Brädspel']}")
    assert response.status_code == 200
    assert _names(response) == ["Brädspel", "Yoga"]

    assert _names(client.get("/profile/interests")) == ["Brädspel", "Yoga"]


def test_adding_same_interest_twice_gives_no_duplicate(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")
    response = client.put(f"/profile/interests/{interests['Yoga']}")
    assert response.status_code == 200
    assert _names(response) == ["Yoga"]


def test_remove_interest(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")
    client.put(f"/profile/interests/{interests['Brädspel']}")

    response = client.delete(f"/profile/interests/{interests['Yoga']}")
    assert response.status_code == 200
    assert _names(response) == ["Brädspel"]
    assert _names(client.get("/profile/interests")) == ["Brädspel"]


def test_cannot_remove_the_last_interest(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")

    response = client.delete(f"/profile/interests/{interests['Yoga']}")

    assert response.status_code == 409
    assert response.json()["detail"] == "Minst ett intresse krävs"
    assert _names(client.get("/profile/interests")) == ["Yoga"]


def test_interest_can_be_swapped_by_adding_the_new_one_first(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")
    client.put(f"/profile/interests/{interests['Brädspel']}")

    response = client.delete(f"/profile/interests/{interests['Yoga']}")

    assert response.status_code == 200
    assert _names(response) == ["Brädspel"]


def test_removing_interest_user_does_not_have_changes_nothing(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")

    response = client.delete(f"/profile/interests/{interests['Klättring']}")
    assert response.status_code == 200
    assert _names(response) == ["Yoga"]


@pytest.mark.parametrize("method", ["put", "delete"])
def test_unknown_interest_gives_404(client, user, interests, method):
    response = getattr(client, method)("/profile/interests/9999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Intresset finns inte"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/profile/interests"),
        ("put", "/profile/interests/1"),
        ("delete", "/profile/interests/1"),
    ],
)
def test_not_logged_in_gives_401(client, interests, method, path):
    # Med riktig inloggning stoppas anropet redan av get_current_user, så
    # "användaren finns inte" (tidigare 404) kan inte längre inträffa.
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.json()["detail"] == "Du är inte inloggad."


# --- Intressebiblioteket: utforska och söka -----------------------------------


@pytest.fixture
def library(db):
    """Ett litet träd: Sport och träning › Löpning › Traillöpning, plus Musik
    och ett inaktivt intresse som inte ska synas."""
    sport = Interest(name="Sport och träning", slug="sport-och-traning")
    music = Interest(name="Musik", slug="musik")
    db.add_all([sport, music])
    db.flush()
    running = Interest(name="Löpning", slug="lopning", parent_id=sport.id, aliases="springa\njogga")
    db.add(running)
    db.flush()
    trail = Interest(name="Traillöpning", slug="traillopning", parent_id=running.id, aliases="springa i skogen")
    gym = Interest(name="Gym", slug="gym", parent_id=sport.id)
    old = Interest(name="Gaming", slug="gaming", status="inactive")
    db.add_all([trail, gym, old])
    db.commit()
    return {i.name: i for i in [sport, music, running, trail, gym, old]}


def _browse(response):
    return [(i["name"], i["path"], i["has_children"]) for i in response.json()]


def test_top_lists_the_main_areas(client, user, library):
    response = client.get("/interests/top")
    assert response.status_code == 200
    assert _browse(response) == [("Musik", [], False), ("Sport och träning", [], True)]


def test_children_lists_one_level_down(client, user, library):
    response = client.get(f"/interests/{library['Sport och träning'].id}/children")
    assert response.status_code == 200
    assert _browse(response) == [
        ("Gym", ["Sport och träning"], False),
        ("Löpning", ["Sport och träning"], True),
    ]


def test_library_items_have_their_areas_slug(client, user, library):
    # Taggens färg följer huvudområdet och slås upp på sluggen: ett huvudområde har sin egen,
    # och allt under det huvudområdets, också två nivåer ner.
    top = {i["name"]: i["area_slug"] for i in client.get("/interests/top").json()}
    assert top == {"Musik": "musik", "Sport och träning": "sport-och-traning"}
    children = client.get(f"/interests/{library['Löpning'].id}/children").json()
    assert [(i["name"], i["area_slug"]) for i in children] == [("Traillöpning", "sport-och-traning")]
    found = client.get("/interests/search", params={"q": "springa"}).json()
    assert {i["area_slug"] for i in found} == {"sport-och-traning"}


def test_place_in_the_tree_takes_one_query_for_the_whole_list(db, library):
    # Sökvägen och huvudområdet räknas fram ur en fråga för hela listan, inte en per förälder.
    from sqlalchemy import event

    from app.crud.interest import interest_places

    wanted = [library[name] for name in ("Traillöpning", "Löpning", "Gym", "Musik")]
    # Inga föräldrar i minnet, bara själva intressena, som listan redan har när den skickas in.
    db.expire_all()
    for interest in wanted:
        db.refresh(interest)
    queries = []

    def listener(conn, cursor, statement, *rest):
        queries.append(statement)

    event.listen(db.bind, "before_cursor_execute", listener)
    try:
        places = interest_places(db, wanted)
    finally:
        event.remove(db.bind, "before_cursor_execute", listener)
    assert len(queries) == 1
    assert places[library["Traillöpning"].id].path == ("Sport och träning", "Löpning")
    assert places[library["Traillöpning"].id].area_slug == "sport-och-traning"
    assert places[library["Musik"].id].path == ()
    assert places[library["Musik"].id].area == "Musik"


def test_children_of_unknown_or_inactive_interest_gives_404(client, user, library):
    assert client.get("/interests/9999/children").status_code == 404
    assert client.get(f"/interests/{library['Gaming'].id}/children").status_code == 404


def test_search_finds_name_and_alias_with_where_it_belongs(client, user, library):
    response = client.get("/interests/search", params={"q": "springa"})
    assert response.status_code == 200
    # Båda via alias; sorterade på namn inom samma nivå.
    assert _browse(response) == [
        ("Löpning", ["Sport och träning"], True),
        ("Traillöpning", ["Sport och träning", "Löpning"], False),
    ]


def test_search_puts_names_starting_with_the_text_first(client, user, library):
    names = [i["name"] for i in client.get("/interests/search", params={"q": "löpning"}).json()]
    assert names == ["Löpning", "Traillöpning"]


def test_search_ignores_case_and_extra_spaces(client, user, library):
    names = [i["name"] for i in client.get("/interests/search", params={"q": "  GYM "}).json()]
    assert names == ["Gym"]


def test_search_treats_percent_and_underscore_as_text(client, user, library):
    assert client.get("/interests/search", params={"q": "%"}).json() == []
    assert client.get("/interests/search", params={"q": "_"}).json() == []


def test_search_needs_text(client, user, library):
    assert client.get("/interests/search", params={"q": ""}).status_code == 422


def test_inactive_interests_are_hidden_everywhere(client, user, library):
    assert "Gaming" not in _names(client.get("/interests/"))
    assert client.get("/interests/search", params={"q": "gaming"}).json() == []


def test_inactive_interest_cannot_be_added_but_can_be_removed(client, db, user, library):
    response = client.put(f"/profile/interests/{library['Gaming'].id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Intresset finns inte"

    # Någon som redan hade det innan det blev inaktivt kan ta bort det.
    user.interests = [library["Gaming"], library["Gym"]]
    db.commit()
    response = client.delete(f"/profile/interests/{library['Gaming'].id}")
    assert response.status_code == 200
    assert _names(response) == ["Gym"]


def test_profile_cannot_be_created_with_inactive_interest(client, user, municipalities, library):
    response = client.post("/profile/", json=profile_payload([library["Gaming"].id]))
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt intresse"


# --- Profilens intressen som träd (parent_id) -----------------------------------


def _parents(response):
    return {i["name"]: i["parent_id"] for i in response.json()}


def test_profile_interests_have_parent_id(client, user, library):
    for name in ["Sport och träning", "Löpning", "Traillöpning"]:
        client.put(f"/profile/interests/{library[name].id}")

    # Traillöpning ligger under Löpning, som ligger under Sport och träning.
    assert _parents(client.get("/profile/interests")) == {
        "Löpning": library["Sport och träning"].id,
        "Sport och träning": None,
        "Traillöpning": library["Löpning"].id,
    }


def test_parent_id_is_set_even_when_the_parent_is_not_on_the_profile(client, user, library):
    # Frontend avgör vad som ritas under vad; svaret säger alltid var intresset hör hemma.
    response = client.put(f"/profile/interests/{library['Gym'].id}")
    assert _parents(response) == {"Gym": library["Sport och träning"].id}


def test_adding_and_removing_returns_parent_id(client, user, library):
    client.put(f"/profile/interests/{library['Musik'].id}")
    response = client.put(f"/profile/interests/{library['Löpning'].id}")
    assert _parents(response) == {"Löpning": library["Sport och träning"].id, "Musik": None}

    response = client.delete(f"/profile/interests/{library['Musik'].id}")
    assert _parents(response) == {"Löpning": library["Sport och träning"].id}


def test_removing_a_parent_keeps_its_sub_interests(client, user, library):
    client.put(f"/profile/interests/{library['Löpning'].id}")
    client.put(f"/profile/interests/{library['Traillöpning'].id}")

    response = client.delete(f"/profile/interests/{library['Löpning'].id}")

    # Traillöpning ligger kvar; frontend ritar det överst när Löpning är borta.
    assert _parents(response) == {"Traillöpning": library["Löpning"].id}


def test_the_interest_list_is_unchanged_without_parent_id(client, user, library):
    # Övriga ställen som använder InterestResponse (listor, filter, klubbar) påverkas inte.
    assert all(set(i) == {"id", "name"} for i in client.get("/interests/").json())


# --- "Menade du": intressen med liknande betydelse ----------------------------


SIMILAR_URL = "/interests/similar"


def _embedded(db, library, vectors=None):
    """Ger alla intressen i biblioteket en vektor och sätter in en falsk Embedder som svarar på frågor."""
    from app.services.ai_clients import set_clients
    from app.services.interest_embeddings import embed_interests, embedding_text
    from tests.fakes import FakeEmbedder

    active = [i for i in library.values() if i.status == "active"]
    wanted = {embedding_text(library[name]): vector for name, vector in (vectors or {}).items()}
    embedder = FakeEmbedder(vectors=wanted)
    embed_interests(db, active, embedder)
    db.commit()
    embedder.calls.clear()
    set_clients(embedder=embedder)
    return embedder


def _vector(*first):
    """En vektor som pekar åt ett håll: de första talen är `first`, resten 0 (inte normaliserad, men likheten räknas rätt)."""
    from app.models.interest_embedding import EMBEDDING_DIMENSIONS

    return [*first, *([0.0] * (EMBEDDING_DIMENSIONS - len(first)))]


def test_similar_finds_an_interest_by_meaning(client, db, user, library):
    nature = _vector(1.0, 0.0)
    embedder = _embedded(db, library, {"Löpning": nature})
    embedder.vectors["vara ute i naturen"] = nature
    response = client.get(SIMILAR_URL, params={"q": "vara ute i naturen"})
    assert response.status_code == 200
    assert _browse(response) == [("Löpning", ["Sport och träning"], True)]
    assert embedder.calls == [["vara ute i naturen"]]


def test_similar_leaves_out_what_is_not_close_enough(client, db, user, library):
    embedder = _embedded(db, library, {"Löpning": _vector(1.0, 0.0)})
    embedder.vectors["något helt annat"] = _vector(0.0, 1.0)  # rätvinkligt: likhet 0
    assert client.get(SIMILAR_URL, params={"q": "något helt annat"}).json() == []


def test_similar_gives_at_most_three_and_closest_first(client, db, user, library):
    _embedded(db, library, {"Löpning": _vector(1.0, 0.0), "Traillöpning": _vector(0.9, 0.1), "Gym": _vector(0.8, 0.2), "Musik": _vector(0.7, 0.3)})
    from app.services.ai_clients import get_embedder

    get_embedder().vectors["spring"] = _vector(1.0, 0.0)
    names = [name for name, _, _ in _browse(client.get(SIMILAR_URL, params={"q": "spring"}))]
    assert names == ["Löpning", "Traillöpning", "Gym"]


def test_similar_leaves_out_an_empty_main_area_and_inactive_interests(client, db, user, library):
    vector = _vector(1.0, 0.0)
    embedder = _embedded(db, library, {"Musik": vector})  # Musik är ett huvudområde utan underintressen
    embedder.vectors["lyssna"] = vector
    assert client.get(SIMILAR_URL, params={"q": "lyssna"}).json() == []


def test_similar_gives_an_empty_list_when_the_embedding_fails(client, db, user, library):
    from app.services.ai_clients import AIFailed

    embedder = _embedded(db, library)
    embedder.error = AIFailed("URLError")
    response = client.get(SIMILAR_URL, params={"q": "vara ute i naturen"})
    assert response.status_code == 200 and response.json() == []


def test_similar_gives_an_empty_list_without_vectors_or_a_key(client, user, library):
    response = client.get(SIMILAR_URL, params={"q": "vara ute i naturen"})
    assert response.status_code == 200 and response.json() == []


def test_similar_needs_three_characters(client, user, library):
    assert client.get(SIMILAR_URL, params={"q": "ab"}).status_code == 422
    assert client.get(SIMILAR_URL, params={"q": "  a  b "}).json() == []


def test_similar_has_a_minute_limit_per_user(client, db, user, library, monkeypatch):
    from app.api.routes import interests as route

    _embedded(db, library)
    monkeypatch.setattr(route, "SIMILAR_RATE_LIMIT", 2)
    statuses = [client.get(SIMILAR_URL, params={"q": f"text {i}"}).status_code for i in range(3)]
    assert statuses == [200, 200, 429]


def test_similar_needs_login(client, library):
    assert client.get(SIMILAR_URL, params={"q": "vara ute"}).status_code == 401


# --- Egna intressen syns för andra först när minst tre användare har dem ------


def _people(db, count):
    """`count` andra användare (id 2 och uppåt), den inloggade (id 1) är user-fixturen."""
    from app.models import User

    people = [User(id=i, username=f"person{i}", password_hash="unused") for i in range(2, 2 + count)]
    db.add_all(people)
    db.commit()
    return people


def _own_interest(db, library, creator_id, holders=(), name="Kubb", parent="Sport och träning"):
    """Ett eget intresse (source user_suggestion) skapat av `creator_id`, som `holders` har på sin profil."""
    from app.models.user_interest import UserInterest

    interest = Interest(
        name=name, parent_id=library[parent].id, source="user_suggestion", created_by_user_id=creator_id
    )
    db.add(interest)
    db.flush()
    for holder in holders:
        db.add(UserInterest(user_id=holder, interest_id=interest.id))
    db.commit()
    return interest


def _children_names(client, interest):
    return [name for name, _, _ in _browse(client.get(f"/interests/{interest.id}/children"))]


def test_someone_elses_own_interest_is_hidden_with_fewer_than_three_users(client, db, user, library):
    _people(db, 3)
    _own_interest(db, library, creator_id=2, holders=[2, 3])  # skaparen och en till: två
    assert "Kubb" not in _children_names(client, library["Sport och träning"])
    assert client.get("/interests/search", params={"q": "kubb"}).json() == []


def test_someone_elses_own_interest_shows_when_three_users_have_it(client, db, user, library):
    _people(db, 3)
    _own_interest(db, library, creator_id=2, holders=[2, 3, 4])  # skaparen plus två till
    assert "Kubb" in _children_names(client, library["Sport och träning"])
    assert _browse(client.get("/interests/search", params={"q": "kubb"})) == [("Kubb", ["Sport och träning"], False)]


def test_the_creator_always_sees_their_own_interest(client, db, user, library):
    _own_interest(db, library, creator_id=user.id)  # ingen har det på sin profil
    assert "Kubb" in _children_names(client, library["Sport och träning"])
    assert [name for name, _, _ in _browse(client.get("/interests/search", params={"q": "kubb"}))] == ["Kubb"]


def test_library_interests_are_always_visible(client, user, library):
    assert "Löpning" in _children_names(client, library["Sport och träning"])
    assert _browse(client.get("/interests/search", params={"q": "löpning"}))


def test_a_hidden_interest_is_still_found_by_meaning(client, db, user, library):
    from app.services.ai_clients import set_clients
    from app.services.interest_embeddings import embed_interests, embedding_text
    from tests.fakes import FakeEmbedder

    _people(db, 1)
    own = _own_interest(db, library, creator_id=2, holders=[2])
    vector = _vector(1.0, 0.0)
    embedder = FakeEmbedder(vectors={embedding_text(own): vector, "gårdsspel": vector})
    embed_interests(db, [own], embedder)
    db.commit()
    set_clients(embedder=embedder)
    assert client.get("/interests/search", params={"q": "kubb"}).json() == []  # dolt i sökningen
    assert [name for name, _, _ in _browse(client.get(SIMILAR_URL, params={"q": "gårdsspel"}))] == ["Kubb"]


# --- "Menade du": stavningskontrollen kommer före betydelsen ------------------


def test_similar_finds_a_misspelled_interest_without_any_embedding_call(client, user, library):
    from app.services.ai_clients import set_clients
    from tests.fakes import FakeEmbedder

    embedder = FakeEmbedder()
    set_clients(embedder=embedder)
    response = client.get(SIMILAR_URL, params={"q": "lopnig"})  # Löpning, felstavat och utan prickar
    assert _browse(response) == [("Löpning", ["Sport och träning"], True)]
    assert embedder.calls == [["lopnig"]]  # tre träffar saknas, så betydelsen fyller på (inget fanns att lägga till)


def test_similar_finds_an_alias_with_a_typo_and_a_different_spelling(client, user, library):
    assert [n for n, _, _ in _browse(client.get(SIMILAR_URL, params={"q": "joga"}))] == ["Löpning"]  # alias jogga
    assert [n for n, _, _ in _browse(client.get(SIMILAR_URL, params={"q": "Trail-löpning"}))] == ["Traillöpning"]


def test_similar_puts_spelling_before_meaning(client, db, user, library):
    vector = _vector(1.0, 0.0)
    embedder = _embedded(db, library, {"Gym": vector})
    embedder.vectors["lopnig"] = vector  # betydelsen pekar på Gym, stavningen på Löpning
    names = [n for n, _, _ in _browse(client.get(SIMILAR_URL, params={"q": "lopnig"}))]
    assert names == ["Löpning", "Gym"]


def test_similar_skips_the_embedding_call_when_spelling_fills_the_list(client, db, user, library):
    from app.models import Interest as I

    for name in ("Löpnings", "Löpningn"):
        db.add(I(name=name, parent_id=library["Sport och träning"].id))
    db.commit()
    embedder = _embedded(db, library)
    names = [n for n, _, _ in _browse(client.get(SIMILAR_URL, params={"q": "lopning"}))]
    assert set(names) == {"Löpning", "Löpnings", "Löpningn"} and embedder.calls == []


def test_similar_does_not_suggest_by_spelling_for_short_or_distant_words(client, user, library):
    assert client.get(SIMILAR_URL, params={"q": "gum"}).json() == []  # för kort för stavningsförslag (Gym)
    assert client.get(SIMILAR_URL, params={"q": "lopningsbana"}).json() == []  # fem tecken ifrån Löpning
    assert client.get(SIMILAR_URL, params={"q": "lopni"}).json() == []  # två tecken ifrån ett sjutecknat ord: för långt


def test_similar_marks_what_matches_in_spelling(client, db, user, library):
    vector = _vector(1.0, 0.0)
    embedder = _embedded(db, library, {"Gym": vector})
    embedder.vectors["lopnig"] = vector
    by_name = {i["name"]: i["spelling"] for i in client.get(SIMILAR_URL, params={"q": "lopnig"}).json()}
    assert by_name == {"Löpning": True, "Gym": False}
