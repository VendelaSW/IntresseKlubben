import secrets
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings

# Frontend skalar om bilden till 512x512 WebP (oftast 20-60 KB), så 2 MB
# är gott om marginal men stoppar att någon laddar upp något enormt.
MAX_IMAGE_BYTES = 2 * 1024 * 1024
IMAGE_CONTENT_TYPE = "image/webp"
UPLOAD_LINK_SECONDS = 300


def is_configured() -> bool:
    return all([
        settings.s3_bucket,
        settings.aws_endpoint_url_s3,
        settings.aws_access_key_id,
        settings.aws_secret_access_key,
    ])


# Klienten skapas först när den behövs, så att appen startar även där
# bucket-inställningarna saknas (då svarar bara bild-endpointsen med fel).
@lru_cache
def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.aws_endpoint_url_s3,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region or None,
        config=Config(signature_version="s3v4"),
    )


def new_profile_image_key(user_id: int) -> str:
    # Slumpat namn: en ny bild får en ny adress, så gamla cachade bilder
    # visas aldrig, och adresser går inte att gissa.
    return f"profiles/{user_id}/{secrets.token_hex(8)}.webp"


def create_upload_url(key: str) -> str:
    return _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.s3_bucket, "Key": key, "ContentType": IMAGE_CONTENT_TYPE},
        ExpiresIn=UPLOAD_LINK_SECONDS,
    )


def get_object_info(key: str) -> dict | None:
    """Filtyp och storlek för en uppladdad fil, eller None om den inte finns."""
    try:
        head = _client().head_object(Bucket=settings.s3_bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise
    return {"content_type": head.get("ContentType"), "size": head.get("ContentLength", 0)}


def delete_object(key: str) -> None:
    # Bästa försök: en kvarglömd gammal bild är inte värd att misslyckas för.
    try:
        _client().delete_object(Bucket=settings.s3_bucket, Key=key)
    except ClientError:
        pass


def public_url(key: str) -> str:
    # Bucketen är publikt läsbar, så en vanlig adress räcker för att visa bilden.
    return f"{settings.aws_endpoint_url_s3.rstrip('/')}/{settings.s3_bucket}/{key}"
