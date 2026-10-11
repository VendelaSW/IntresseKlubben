"""Tester för profilbilden.

Bucketen är fejkad med moto (en S3 i minnet), så testerna rör aldrig den
riktiga bucketen. Webbläsarens uppladdning till den signerade länken
simuleras med put_object direkt mot den fejkade bucketen.
"""

import boto3
import pytest
from moto import mock_aws

from app.core import storage
from app.core.config import settings
from tests.helpers import make_profile

BUCKET = "test-profilepics"
REGION = "eu-central-1"
ENDPOINT = f"https://s3.{REGION}.amazonaws.com"
# Backend kontrollerar bara filtyp och storlek, inte själva bildinnehållet.
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 test"


@pytest.fixture
def s3(monkeypatch):
    for name, value in {
        "s3_bucket": BUCKET,
        "aws_endpoint_url_s3": ENDPOINT,
        "aws_access_key_id": "testing",
        "aws_secret_access_key": "testing",
        "aws_region": REGION,
    }.items():
        monkeypatch.setattr(settings, name, value)
    storage._client.cache_clear()  # klienten cachas, så den måste byggas om med testvärdena
    with mock_aws():
        client = boto3.client(
            "s3", region_name=REGION, endpoint_url=ENDPOINT,
            aws_access_key_id="testing", aws_secret_access_key="testing",
        )
        client.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": REGION})
        yield client
    storage._client.cache_clear()


@pytest.fixture
def profile(db, user):
    db.add(make_profile(1, name="Vendela"))
    db.commit()


def _upload(client, s3, body=WEBP, content_type="image/webp"):
    """Hämtar en uppladdningslänk och "laddar upp" som webbläsaren skulle."""
    key = client.post("/profile/image/upload-url").json()["key"]
    s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType=content_type)
    return key


def _stored_keys(s3):
    return [obj["Key"] for obj in s3.list_objects_v2(Bucket=BUCKET).get("Contents", [])]


def test_upload_link_is_signed_and_points_to_own_folder(client, s3, profile):
    response = client.post("/profile/image/upload-url")
    assert response.status_code == 200
    body = response.json()
    assert body["key"].startswith("profiles/1/")
    assert body["key"].endswith(".webp")
    assert body["key"] in body["upload_url"]
    assert "X-Amz-Signature=" in body["upload_url"]
    assert "X-Amz-Expires=300" in body["upload_url"]


def test_confirmed_image_is_saved_and_shown_on_profile(client, s3, profile):
    key = _upload(client, s3)

    response = client.put("/profile/image", json={"key": key})
    assert response.status_code == 200
    expected_url = f"{ENDPOINT}/{BUCKET}/{key}"
    assert response.json()["image_url"] == expected_url
    assert client.get("/profile/").json()["image_url"] == expected_url


def test_new_image_replaces_and_deletes_the_old_one(client, s3, profile):
    first = _upload(client, s3)
    client.put("/profile/image", json={"key": first})
    second = _upload(client, s3)

    response = client.put("/profile/image", json={"key": second})
    assert response.status_code == 200
    assert _stored_keys(s3) == [second]


@pytest.mark.parametrize(
    "key",
    [
        "profiles/2/abc.webp",        # någon annans mapp
        "profiles/1/../2/abc.webp",   # försök att ta sig ur den egna mappen
        "profiles/1/sub/abc.webp",    # undermappar delas aldrig ut
        "profiles/1/abc.png",         # bara .webp
        "other/1/abc.webp",           # utanför profiles/
    ],
)
def test_rejects_keys_that_were_not_handed_out(client, s3, profile, key):
    response = client.put("/profile/image", json={"key": key})
    assert response.status_code == 422
    assert response.json()["detail"] == "Ogiltig bild"


def test_rejects_confirm_when_nothing_was_uploaded(client, s3, profile):
    key = client.post("/profile/image/upload-url").json()["key"]
    response = client.put("/profile/image", json={"key": key})
    assert response.status_code == 422
    assert "hittades inte" in response.json()["detail"]


@pytest.mark.parametrize(
    ("body", "content_type"),
    [
        (WEBP, "image/png"),                                   # fel filtyp
        (b"x" * (storage.MAX_IMAGE_BYTES + 1), "image/webp"),  # för stor
    ],
    ids=["wrong-type", "too-large"],
)
def test_rejects_and_deletes_invalid_uploads(client, s3, profile, body, content_type):
    key = _upload(client, s3, body=body, content_type=content_type)

    response = client.put("/profile/image", json={"key": key})
    assert response.status_code == 422
    assert response.json()["detail"] == "Bilden måste vara WebP och högst 2 MB"
    assert key not in _stored_keys(s3)
    assert client.get("/profile/").json()["image_url"] is None


def test_image_requires_an_existing_profile(client, s3, user):
    response = client.post("/profile/image/upload-url")
    assert response.status_code == 404
    assert response.json()["detail"] == "Skapa din profil innan du lägger till en bild"
    assert client.put("/profile/image", json={"key": "profiles/1/abc.webp"}).status_code == 404


def test_clear_error_when_storage_is_not_configured(client, profile):
    # Utan s3-fixturen är bucket-inställningarna tomma (se conftest.py).
    for response in (
        client.post("/profile/image/upload-url"),
        client.put("/profile/image", json={"key": "profiles/1/abc.webp"}),
    ):
        assert response.status_code == 503
        assert response.json()["detail"] == "Bilduppladdning är inte konfigurerad på servern"
    # Resten av profilen fungerar ändå.
    assert client.get("/profile/").status_code == 200
