import ast
from pathlib import Path

import pytest

from app.core.profanity import contains_profanity
from app.models import Event, Group, Interest, Profile
from app.services.text_moderation import WordFilterError, censor_message, check_fields
from app.services.text_policy import TextNotAllowed, check_text
from tests.event_helpers import payload as event_payload
from tests.helpers import profile_payload


def test_local_filter_rejects_fields_with_swedish_validation_error():
    with pytest.raises(WordFilterError) as error:
        check_fields(description="Klubben använder FUCK i beskrivningen")
    assert error.value.field == "description"
    assert str(error.value) == "Beskrivningen innehåller otillåtet språk."


@pytest.mark.parametrize("text", [
    "Slut på lagret för kaffefilter.",
    "Vi läser om nazismens historia.",
    "Fagottgruppen övar i kväll.",
    "Vi följer horisonten längs leden.",
    "En föreläsning om hormoner och träning.",
])
def test_local_filter_keeps_known_false_positive_traps(text):
    assert contains_profanity(text) is False
    check_fields(description=text)


def test_om_mig_policy_uses_local_filter_without_openai():
    with pytest.raises(TextNotAllowed):
        check_text("Jag använder FUCK som uttryck.")
    assert check_text("Jag spelar fagott.") is None


@pytest.mark.parametrize("field", ["title", "description", "place_name", "address"])
@pytest.mark.parametrize("operation", ["create", "update"])
def test_event_text_fields_use_local_filter_before_save(client, db, user, field, operation):
    db.add(Interest(id=1, name="Löpning"))
    db.commit()
    if operation == "create":
        response = client.post("/events/", json=event_payload(**{field: "FUCK"}))
        expected_count = 0
    else:
        created = client.post("/events/", json=event_payload())
        assert created.status_code == 201
        response = client.patch(f"/events/{created.json()['id']}", json={field: "FUCK"})
        expected_count = 1
    assert response.status_code == 422
    assert db.query(Event).count() == expected_count


@pytest.mark.parametrize("field", ["name", "description", "meeting_info", "place_name", "address"])
def test_group_text_fields_use_local_filter_before_save(client, db, user, municipalities, field):
    db.add(Interest(id=1, name="Schack"))
    db.commit()
    response = client.post("/groups/", json={
        "name": "Ny klubb",
        "description": "Schack på torsdag.",
        "meeting_info": "På torsdag",
        "place_name": "Föreningslokalen",
        "address": "Storgatan 1",
        "interest_id": 1,
        "municipality_code": "1480",
        field: "FUCK",
    })
    assert response.status_code == 422
    assert db.query(Group).count() == 0


@pytest.mark.parametrize("operation", ["create", "update"])
def test_profile_neighborhood_uses_local_filter(client, db, user, municipalities, operation):
    interest = Interest(name="Yoga")
    db.add(interest)
    db.commit()
    if operation == "create":
        response = client.post("/profile/", json=profile_payload([interest.id], district="FUCK"))
        expected_count = 0
    else:
        created = client.post("/profile/", json=profile_payload([interest.id], district="Majorna"))
        assert created.status_code == 201
        response = client.patch("/profile/", json={"district": "FUCK"})
        expected_count = 1
    assert response.status_code == 422
    assert "otillåtet språk" in str(response.json()["detail"])
    assert db.query(Profile).count() == expected_count


def test_chat_text_is_censored_locally():
    assert censor_message("Din fitta!") == "Din *****!"


@pytest.mark.parametrize("layer", ["crud", "schemas"])
def test_content_moderation_is_not_in_crud_or_pydantic_schemas(layer):
    root = Path(__file__).parents[1] / "app" / layer
    forbidden = {"app.services.ai_clients", "app.services.text_policy", "app.services.text_moderation"}
    for path in root.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                assert node.module not in forbidden, f"{path.name} imports {node.module}"
