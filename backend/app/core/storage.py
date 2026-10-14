import secrets
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings

# Frontend skalar om bilden till 512x512 (oftast 20-60 KB), så 2 MB är gott
# om marginal men stoppar att någon laddar upp något enormt.
MAX_IMAGE_BYTES = 2 * 1024 * 1024
# Filtyperna som tas emot, med filändelsen bilden får. Frontend gör WebP, och
# JPEG i webbläsare som inte kan skapa WebP (Safari, och därmed alla
# webbläsare på iPhone).
IMAGE_TYPES = {"image/webp": "webp", "image/jpeg": "jpg"}
UPLOAD_LINK_SECONDS = 300

# En uppladdad bild ändras aldrig: en ny bild får ett nytt namn (se
# new_profile_image_key). Därför får webbläsare spara den i ett år utan att
# fråga lagringen igen, vilket gör listor med många profilbilder snabbare.
IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable"


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


def new_profile_image_key(user_id: int, content_type: str) -> str:
    # Slumpat namn: en ny bild får en ny adress, så gamla cachade bilder
    # visas aldrig, och adresser går inte att gissa.
    return f"profiles/{user_id}/{secrets.token_hex(8)}.{IMAGE_TYPES[content_type]}"


def content_type_for_key(key: str) -> str | None:
    """Filtypen en bild med det här namnet ska ha, eller None för en okänd ändelse."""
    extension = key.rsplit(".", 1)[-1]
    return next((ct for ct, ext in IMAGE_TYPES.items() if ext == extension), None)


def upload_headers(content_type: str) -> dict[str, str]:
    """Headrarna webbläsaren ska skicka med uppladdningen. De ingår i
    signaturen (se create_upload_url), så de måste stämma exakt."""
    return {"Content-Type": content_type, "Cache-Control": IMAGE_CACHE_CONTROL}


def create_upload_url(key: str, content_type: str) -> str:
    # Filtypen och cache-inställningen ingår i signaturen, så uppladdningen
    # måste skickas med just dem (se upload_headers). Lagringen sparar
    # cache-inställningen med bilden och skickar den när bilden visas.
    return _client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": key,
            "ContentType": content_type,
            "CacheControl": IMAGE_CACHE_CONTROL,
        },
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
