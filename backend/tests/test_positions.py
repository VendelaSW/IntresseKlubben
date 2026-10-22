"""Positioner på kartan för events och klubbar (schemas/position.py), och adressökningen
(GET /geocode och GET /geocode/reverse, services/geocoding.py). Nominatim anropas aldrig: conftest.py sätter in en fejkad
adressökning (FakeGeocoder) som testerna kan byta ut."""

import io
import json

import pytest

from app.core import error_messages as msg
from app.models import Interest
from app.services import geocoding
from app.services.geocoding import NominatimGeocoder, Place, set_geocoder
from tests.event_helpers import add_event, payload
from tests.fakes import FakeGeocoder

GUSTAVSBERG = {"latitude": 59.3266, "longitude": 18.3889}


@pytest.fixture
def interest(db):
    row = Interest(id=1, name="Löpning")
    db.add(row)
    db.commit()
    return row


def _messages(response) -> str:
    return json.dumps(response.json(), ensure_ascii=False)


# --- Events ------------------------------------------------------------------


def test_event_is_saved_with_its_position(client, user, interest):
    response = client.post("/events/", json=payload(**GUSTAVSBERG))
    assert response.status_code == 201, response.json()
    event = response.json()
    assert (event["latitude"], event["longitude"]) == (59.3266, 18.3889)
    listed = client.get("/events/").json()
    assert (listed[0]["latitude"], listed[0]["longitude"]) == (59.3266, 18.3889)


def test_event_without_position_has_none(client, user, interest):
    event = client.post("/events/", json=payload()).json()
    assert event["latitude"] is None and event["longitude"] is None


@pytest.mark.parametrize(
    "position, message",
    [
        ({"latitude": 59.3}, msg.POSITION_INCOMPLETE),
        ({"longitude": 18.3}, msg.POSITION_INCOMPLETE),
        ({"latitude": 48.85, "longitude": 2.35}, msg.POSITION_OUTSIDE_SWEDEN),  # Paris
        ({"latitude": 60.17, "longitude": 24.94}, msg.POSITION_OUTSIDE_SWEDEN),  # Helsingfors
    ],
)
def test_event_position_must_be_complete_and_in_sweden(client, user, interest, position, message):
    response = client.post("/events/", json=payload(**position))
    assert response.status_code == 422
    assert message in _messages(response)


def test_event_position_can_be_set_moved_and_removed(client, db, user, interest):
    event = add_event(db, user.id)
    response = client.patch(f"/events/{event.id}", json=GUSTAVSBERG)
    assert response.status_code == 200, response.json()
    assert response.json()["latitude"] == 59.3266

    # Ändras något annat ligger positionen kvar.
    response = client.patch(f"/events/{event.id}", json={"title": "Ny titel"})
    assert response.json()["latitude"] == 59.3266

    response = client.patch(f"/events/{event.id}", json={"latitude": None, "longitude": None})
    assert response.status_code == 200
    assert response.json()["latitude"] is None and response.json()["longitude"] is None


def test_event_update_needs_both_coordinates(client, db, user, interest):
    event = add_event(db, user.id)
    response = client.patch(f"/events/{event.id}", json={"latitude": 59.3})
    assert response.status_code == 422
    assert msg.POSITION_INCOMPLETE in _messages(response)


# --- Klubbar -----------------------------------------------------------------


@pytest.fixture
def group_payload(interest, municipalities):
    def _payload(**changes):
        return {
            "name": "Morgonlöparna",
            "description": "Lugna rundor före jobbet.",
            "interest_id": interest.id,
            "municipality_code": "1480",
            **changes,
        }

    return _payload


def test_club_is_saved_with_its_meeting_place(client, user, group_payload):
    response = client.post(
        "/groups/", json=group_payload(place_name="Slottsskogen", address="Slottsskogsvallen 1", **GUSTAVSBERG)
    )
    assert response.status_code == 201, response.json()
    club = response.json()
    assert club["place_name"] == "Slottsskogen"
    assert club["address"] == "Slottsskogsvallen 1"
    assert (club["latitude"], club["longitude"]) == (59.3266, 18.3889)


def test_club_meeting_place_is_optional(client, user, group_payload):
    club = client.post("/groups/", json=group_payload(place_name="  ", address="")).json()
    assert club["place_name"] is None and club["address"] is None
    assert club["latitude"] is None and club["longitude"] is None


def test_club_position_must_be_in_sweden(client, user, group_payload):
    response = client.post("/groups/", json=group_payload(latitude=48.85, longitude=2.35))
    assert response.status_code == 422
    assert msg.POSITION_OUTSIDE_SWEDEN in _messages(response)


def test_club_place_name_has_a_max_length(client, user, group_payload):
    response = client.post("/groups/", json=group_payload(place_name="x" * 101))
    assert response.status_code == 422
    assert msg.GROUP_PLACE_NAME_TOO_LONG in _messages(response)


# --- Adressökning ------------------------------------------------------------


def test_geocode_returns_the_places_found(client, user):
    fake = FakeGeocoder(places=[Place("Storgatan 1, Gustavsberg, Värmdö kommun", 59.32, 18.38)])
    set_geocoder(fake)
    response = client.get("/geocode", params={"q": "  Storgatan 1 Gustavsberg "})
    assert response.status_code == 200
    assert response.json() == [{"label": "Storgatan 1, Gustavsberg, Värmdö kommun", "latitude": 59.32, "longitude": 18.38}]
    # Bara söktexten skickas vidare, utan blanksteg runt.
    assert fake.queries == ["Storgatan 1 Gustavsberg"]


@pytest.mark.parametrize("query, message", [("ab", msg.GEOCODE_QUERY_TOO_SHORT), ("x" * 201, msg.GEOCODE_QUERY_TOO_LONG)])
def test_geocode_rejects_too_short_or_long_queries(client, user, query, message):
    response = client.get("/geocode", params={"q": query})
    assert response.status_code == 422
    assert response.json()["detail"] == message


def test_geocode_says_when_the_service_is_unavailable(client, user):
    set_geocoder(FakeGeocoder(fail=True))
    response = client.get("/geocode", params={"q": "Storgatan 1"})
    assert response.status_code == 503
    assert response.json()["detail"] == msg.GEOCODE_UNAVAILABLE


def test_geocode_has_a_limit_per_user(client, user):
    from app.api.routes.geocode import RATE_LIMIT

    for _ in range(RATE_LIMIT):
        assert client.get("/geocode", params={"q": "Storgatan 1"}).status_code == 200
    response = client.get("/geocode", params={"q": "Storgatan 1"})
    assert response.status_code == 429
    assert response.json()["detail"] == msg.GEOCODE_TOO_MANY_REQUESTS


def test_geocode_requires_a_profile(client, user, profile_lock):
    assert client.get("/geocode", params={"q": "Storgatan 1"}).status_code == 403


# --- Adressen där nålen står (SCRUM-241) ---------------------------------------


def test_reverse_geocode_returns_the_street_address(client, user):
    fake = FakeGeocoder(address="Odelbergs väg 2")
    set_geocoder(fake)
    response = client.get("/geocode/reverse", params={"lat": GUSTAVSBERG["latitude"], "lon": GUSTAVSBERG["longitude"]})
    assert response.status_code == 200
    assert response.json() == {"address": "Odelbergs väg 2"}
    # Bara positionen skickas vidare.
    assert fake.positions == [(GUSTAVSBERG["latitude"], GUSTAVSBERG["longitude"])]


def test_reverse_geocode_without_a_street_gives_no_address(client, user):
    set_geocoder(FakeGeocoder(address=None))
    response = client.get("/geocode/reverse", params={"lat": GUSTAVSBERG["latitude"], "lon": GUSTAVSBERG["longitude"]})
    assert response.status_code == 200
    assert response.json() == {"address": None}


def test_reverse_geocode_only_in_sweden(client, user):
    fake = FakeGeocoder(address="Unter den Linden 1")
    set_geocoder(fake)
    response = client.get("/geocode/reverse", params={"lat": 52.52, "lon": 13.40})  # Berlin
    assert response.status_code == 422
    assert response.json()["detail"] == msg.POSITION_OUTSIDE_SWEDEN
    assert fake.positions == []


def test_reverse_geocode_says_when_the_service_is_unavailable(client, user):
    set_geocoder(FakeGeocoder(fail=True))
    response = client.get("/geocode/reverse", params={"lat": GUSTAVSBERG["latitude"], "lon": GUSTAVSBERG["longitude"]})
    assert response.status_code == 503
    assert response.json()["detail"] == msg.GEOCODE_UNAVAILABLE


def test_reverse_geocode_has_its_own_higher_limit(client, user):
    from app.api.routes.geocode import RATE_LIMIT, REVERSE_RATE_LIMIT

    params = {"lat": GUSTAVSBERG["latitude"], "lon": GUSTAVSBERG["longitude"]}
    # Adressen följer nålen medan man drar den, så den får fler anrop än sökningen ...
    for _ in range(REVERSE_RATE_LIMIT):
        assert client.get("/geocode/reverse", params=params).status_code == 200
    response = client.get("/geocode/reverse", params=params)
    assert response.status_code == 429
    assert response.json()["detail"] == msg.GEOCODE_TOO_MANY_REQUESTS
    # ... och sökningen fungerar ändå efteråt.
    assert REVERSE_RATE_LIMIT > RATE_LIMIT
    assert client.get("/geocode", params={"q": "Storgatan 1"}).status_code == 200


def test_reverse_geocode_requires_a_profile(client, user, profile_lock):
    params = {"lat": GUSTAVSBERG["latitude"], "lon": GUSTAVSBERG["longitude"]}
    assert client.get("/geocode/reverse", params=params).status_code == 403


# --- Nominatim-klienten (utan nätverk) -----------------------------------------


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_nominatim_client_asks_politely_shortens_names_and_remembers(monkeypatch):
    requests = []

    def fake_urlopen(request, timeout):
        requests.append(request)
        body = [
            {"display_name": "Storgatan 1, Centrum, Gustavsberg, Värmdö kommun, Sverige", "lat": "59.32", "lon": "18.38"},
            {"display_name": "Trasig", "lat": "inte ett tal", "lon": "18"},
        ]
        return _Response(json.dumps(body).encode("utf-8"))

    monkeypatch.setattr(geocoding.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(geocoding, "MIN_INTERVAL_SECONDS", 0)
    client = NominatimGeocoder()

    places = client.search("Storgatan 1")
    assert places == [Place("Storgatan 1, Centrum, Gustavsberg", 59.32, 18.38)]
    # Appen presenterar sig och söker bara i Sverige.
    assert "IntresseKlubben" in requests[0].get_header("User-agent")
    assert "countrycodes=se" in requests[0].full_url

    # Samma sökning (oavsett skiftläge och blanksteg) svaras ur minnet.
    assert client.search("  storgatan   1 ") == places
    assert len(requests) == 1


@pytest.mark.parametrize(
    "display_name, label",
    [
        ("2, Odelbergs väg, Charlottendal, Gustavsberg, Värmdö kommun, Sverige", "Odelbergs väg 2, Charlottendal, Gustavsberg"),
        ("12B, Storgatan, Centrum, Sundsvall, Sverige", "Storgatan 12B, Centrum, Sundsvall"),
        ("Slottsskogen, Göteborg, Västra Götalands län, Sverige", "Slottsskogen, Göteborg, Västra Götalands län"),
    ],
)
def test_nominatim_labels_put_the_house_number_after_the_street(display_name, label):
    assert geocoding._short_label(display_name) == label


@pytest.mark.parametrize(
    "error",
    [
        geocoding.urllib.error.URLError("nere"),
        TimeoutError(),
        ConnectionResetError(),
        geocoding.http.client.RemoteDisconnected("stängd"),
        geocoding.http.client.IncompleteRead(b""),
    ],
)
def test_nominatim_client_turns_network_errors_into_geocoding_failed(monkeypatch, error):
    def broken(request, timeout):
        raise error

    monkeypatch.setattr(geocoding.urllib.request, "urlopen", broken)
    monkeypatch.setattr(geocoding, "MIN_INTERVAL_SECONDS", 0)
    with pytest.raises(geocoding.GeocodingFailed):
        NominatimGeocoder().search("Storgatan 1")


def test_nominatim_reverse_gives_street_and_number_and_remembers(monkeypatch):
    requests = []

    def fake_urlopen(request, timeout):
        requests.append(request)
        body = {"address": {"house_number": "2", "road": "Odelbergs väg", "town": "Gustavsberg"}}
        return _Response(json.dumps(body).encode("utf-8"))

    monkeypatch.setattr(geocoding.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(geocoding, "MIN_INTERVAL_SECONDS", 0)
    client = NominatimGeocoder()

    assert client.reverse(59.3266, 18.3889) == "Odelbergs väg 2"
    assert "/reverse?" in requests[0].full_url
    # Bara adresser, så att en nål i en park får den närmaste gatan.
    assert "layer=address" in requests[0].full_url
    assert "IntresseKlubben" in requests[0].get_header("User-agent")
    # Samma plats (på en meter när) svaras ur minnet.
    assert client.reverse(59.326601, 18.388899) == "Odelbergs väg 2"
    assert len(requests) == 1


@pytest.mark.parametrize(
    "body, address",
    [
        ({"address": {"road": "Storgatan"}}, "Storgatan"),
        ({"address": {"footway": "Strandpromenaden", "house_number": "4"}}, "Strandpromenaden 4"),
        ({"address": {"park": "Slottsskogen", "city": "Göteborg"}}, None),
        ({"error": "Unable to geocode"}, None),
    ],
)
def test_nominatim_reverse_only_gives_a_street_address(monkeypatch, body, address):
    monkeypatch.setattr(
        geocoding.urllib.request, "urlopen", lambda request, timeout: _Response(json.dumps(body).encode("utf-8"))
    )
    monkeypatch.setattr(geocoding, "MIN_INTERVAL_SECONDS", 0)
    assert NominatimGeocoder().reverse(57.69, 11.95) == address


def test_nominatim_reverse_turns_network_errors_into_geocoding_failed(monkeypatch):
    def broken(request, timeout):
        raise TimeoutError()

    monkeypatch.setattr(geocoding.urllib.request, "urlopen", broken)
    monkeypatch.setattr(geocoding, "MIN_INTERVAL_SECONDS", 0)
    with pytest.raises(geocoding.GeocodingFailed):
        NominatimGeocoder().reverse(57.69, 11.95)
