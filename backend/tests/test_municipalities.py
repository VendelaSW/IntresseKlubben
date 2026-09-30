def test_lists_all_municipalities(client, municipalities):
    response = client.get("/municipalities/")
    assert response.status_code == 200
    assert sorted(response.json(), key=lambda m: m["code"]) == [
        {"code": "1480", "name": "Göteborg"},
        {"code": "1481", "name": "Mölndal"},
    ]


def test_empty_list_when_no_municipalities(client):
    response = client.get("/municipalities/")
    assert response.status_code == 200
    assert response.json() == []
