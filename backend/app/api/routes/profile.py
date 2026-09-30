from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

# from app.auth.security import get_current_user  # TODO: använd när E/F:s auth är klar
from app.core import storage
from app.crud.profile import calculate_age, get_profile, set_profile_image, update_profile
from app.db.session import get_db
from app.models.municipality import Municipality
from app.schemas.profile import (
    ProfileImageConfirm,
    ProfileImageUploadUrl,
    ProfileResponse,
    ProfileUpdate,
)

router = APIRouter(prefix="/profile", tags=["profile"])


# TEMPORÄR mock tills E/F:s inloggning finns. Alla anrop blir user 1.
# Ta bort den här funktionen och avkommentera importen ovan innan merge.
def get_current_user():
    class FakeUser:
        id = 1

    return FakeUser()


def _to_response(profile) -> ProfileResponse:
    return ProfileResponse(
        name=profile.name,
        birth_date=profile.birth_date,
        age=calculate_age(profile.birth_date) if profile.birth_date else None,
        gender=profile.gender,
        municipality_code=profile.municipality_code,
        municipality_name=profile.municipality.name if profile.municipality else None,
        district=profile.district,
        image_url=storage.public_url(profile.profile_image_url) if profile.profile_image_url else None,
    )


@router.get("/", response_model=ProfileResponse)
def read_profile(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Ingen profil hittad")
    return _to_response(profile)


@router.patch("/", response_model=ProfileResponse)
def edit_profile(
    data: ProfileUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Kolla koden här så att en okänd kod ger ett tydligt fel i stället för
    # ett databasfel (500) från främmande nyckeln.
    if data.municipality_code is not None and db.get(Municipality, data.municipality_code) is None:
        raise HTTPException(status_code=422, detail="Okänd kommun")
    profile = update_profile(db, current_user.id, data)
    return _to_response(profile)


# Profilbild i två steg, så att själva bilden går direkt från webbläsaren
# till bucketen (Vercel begränsar anrop till backend till ca 4,5 MB):
#   1. POST /profile/image/upload-url  → länk att ladda upp till
#   2. webbläsaren laddar upp WebP-bilden till länken
#   3. PUT  /profile/image              → backend kontrollerar filen och sparar den
def _require_storage():
    if not storage.is_configured():
        raise HTTPException(status_code=503, detail="Bilduppladdning är inte konfigurerad på servern")


@router.post("/image/upload-url", response_model=ProfileImageUploadUrl)
def create_profile_image_upload_url(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_storage()
    if get_profile(db, current_user.id) is None:
        raise HTTPException(status_code=404, detail="Skapa din profil innan du lägger till en bild")
    key = storage.new_profile_image_key(current_user.id)
    return ProfileImageUploadUrl(upload_url=storage.create_upload_url(key), key=key)


@router.put("/image", response_model=ProfileResponse)
def confirm_profile_image(
    data: ProfileImageConfirm,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_storage()
    profile = get_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Ingen profil hittad")

    # Bara filer i användarens egen mapp, med ett namn vi själva har delat ut.
    prefix = f"profiles/{current_user.id}/"
    name = data.key.removeprefix(prefix)
    if not data.key.startswith(prefix) or "/" in name or not name.endswith(".webp"):
        raise HTTPException(status_code=422, detail="Ogiltig bild")

    info = storage.get_object_info(data.key)
    if info is None:
        raise HTTPException(status_code=422, detail="Bilden hittades inte. Försök ladda upp igen.")
    if info["content_type"] != storage.IMAGE_CONTENT_TYPE or info["size"] > storage.MAX_IMAGE_BYTES:
        storage.delete_object(data.key)
        raise HTTPException(status_code=422, detail="Bilden måste vara WebP och högst 2 MB")

    old_key = set_profile_image(db, profile, data.key)
    if old_key and old_key != data.key:
        storage.delete_object(old_key)
    return _to_response(profile)
