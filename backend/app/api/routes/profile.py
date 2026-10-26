import hashlib
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.core import error_messages as msg
from app.core import storage
from app.crud.profile import (
    ProfileExistsError,
    ProfileNotFoundError,
    UnknownInterestError,
    calculate_age,
    create_profile,
    get_profile,
    set_profile_image,
    update_profile,
)
from app.db.session import get_db
from app.models.municipality import Municipality
from app.schemas.profile import (
    ProfileCreate,
    ProfileImageConfirm,
    ProfileImageUploadRequest,
    ProfileImageUploadUrl,
    ProfileResponse,
    ProfileTextCheck,
    ProfileUpdate,
)
from app.services.text_policy import TextCheckUnavailable, TextNotAllowed, check_text
from app.services.profile_embeddings import start_embedding, start_embedding_if_needed, store_profile_embedding
from app.services.text_moderation import check_fields

router = APIRouter(prefix="/profile", tags=["profile"])

# Förhandskontrollen av Om mig-texten kostar AI-anrop, så en användare får bara göra ett fåtal per minut. Gränsen
# räknas i minnet per serverinstans, som den på /interests/analyze: en spärr och inget mer.
TEXT_CHECK_LIMIT = 10
TEXT_CHECK_WINDOW_SECONDS = 60
_recent_text_checks: dict[int, deque[float]] = defaultdict(deque)


def _check_text_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    calls = _recent_text_checks[user_id]
    while calls and now - calls[0] > TEXT_CHECK_WINDOW_SECONDS:
        calls.popleft()
    if len(calls) >= TEXT_CHECK_LIMIT:
        raise HTTPException(status_code=429, detail=msg.INTERVIEW_TOO_MANY_REQUESTS)
    calls.append(now)


# Texter som redan har klarat förhandskontrollen, så att samma text inte kontrolleras en gång till när profilen sparas.
# Minnet är per serverinstans och gäller en stund. Hamnar sparandet på en annan instans, eller har det gått för lång
# tid, kontrolleras texten som vanligt. Det här sparar alltså bara anrop och kan aldrig släppa igenom en text som inte
# har kontrollerats.
CHECKED_TEXT_SECONDS = 30 * 60
_checked_texts: dict[int, tuple[str, float]] = {}


def _fingerprint(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def _remember_checked(user_id: int, text: str) -> None:
    now = time.monotonic()
    for other, (_, at) in list(_checked_texts.items()):
        if now - at > CHECKED_TEXT_SECONDS:
            del _checked_texts[other]
    _checked_texts[user_id] = (_fingerprint(text), now)


def _already_checked(user_id: int, text: str) -> bool:
    found = _checked_texts.get(user_id)
    return found is not None and time.monotonic() - found[1] <= CHECKED_TEXT_SECONDS and found[0] == _fingerprint(text)


def _check_profile_text(text: str, user_id: int | None = None) -> None:
    """Om mig-texten får inte vara nazistisk, pedofil eller hatisk eller våldsam (se
    app/services/text_policy.py). Kontrollen är fail-closed: går den inte att köra sparas inget. Är det
    samma text som användaren nyss har fått godkänd av förhandskontrollen (user_id) görs den inte om."""
    if user_id is not None:
        if _already_checked(user_id, text):
            return
        # En ny kontroll kostar ett AI-anrop, så den räknas mot samma minutgräns som förhandskontrollen. En text som
        # redan är godkänd (ovan) räknas inte. Förhandskontrollen själv (utan user_id) räknar redan i sin route.
        _check_text_rate_limit(user_id)
    try:
        check_text(text)
    except TextNotAllowed:
        raise HTTPException(status_code=422, detail=msg.PROFILE_TEXT_NOT_ALLOWED) from None
    except TextCheckUnavailable:
        raise HTTPException(status_code=503, detail=msg.TEXT_CHECK_UNAVAILABLE) from None


def _to_response(profile) -> ProfileResponse:
    return ProfileResponse(
        name=profile.name,
        birth_date=profile.birth_date,
        age=calculate_age(profile.birth_date) if profile.birth_date else None,
        gender=profile.gender,
        gender_searchable=profile.gender_searchable,
        municipality_code=profile.municipality_code,
        municipality_name=profile.municipality.name if profile.municipality else None,
        district=profile.district,
        image_url=storage.public_url(profile.profile_image_url) if profile.profile_image_url else None,
        profile_text=profile.profile_text,
    )


@router.get("/", response_model=ProfileResponse)
def read_profile(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail=msg.PROFILE_NOT_FOUND)
    return _to_response(profile)


@router.post("/", response_model=ProfileResponse, status_code=201)
def add_profile(
    data: ProfileCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Kolla koden här så att en okänd kod ger ett tydligt fel i stället för
    # ett databasfel (500) från främmande nyckeln.
    if db.get(Municipality, data.municipality_code) is None:
        raise HTTPException(status_code=422, detail=msg.UNKNOWN_MUNICIPALITY)
    # Finns profilen redan ska det inte kosta ett AI-anrop att få veta det (som i intervjun, interest_confirm.py).
    if get_profile(db, current_user.id) is not None:
        raise HTTPException(status_code=409, detail=msg.PROFILE_ALREADY_EXISTS)
    # Vektorn för Om mig-texten räknas samtidigt som texten kontrolleras (se services/profile_embeddings.py).
    pending_embedding = start_embedding(data.profile_text)
    check_fields(name=data.name, profile_text=data.profile_text, district=data.district)
    _check_profile_text(data.profile_text, current_user.id)
    try:
        profile = create_profile(db, current_user.id, data)
    except ProfileExistsError:
        raise HTTPException(status_code=409, detail=msg.PROFILE_ALREADY_EXISTS)
    except UnknownInterestError:
        raise HTTPException(status_code=422, detail=msg.UNKNOWN_INTEREST)
    store_profile_embedding(db, profile, pending_embedding)  # kastar aldrig: profilen är sparad
    return _to_response(profile)


@router.post("/text-check", status_code=204)
def check_profile_text_early(data: ProfileTextCheck, current_user=Depends(get_current_user)) -> Response:
    """Kontrollerar Om mig-texten utan att spara något, så att man får veta att den nekas redan när man skrivit
    den och inte först när profilen sparas. Samma kontroll som vid sparandet: 422 om texten inte får finnas,
    503 om kontrollen inte gick att köra, 204 om den är okej. En text som klarat den kontrolleras inte igen när
    samma text sparas strax efteråt."""
    _check_text_rate_limit(current_user.id)
    _check_profile_text(data.profile_text)
    _remember_checked(current_user.id, data.profile_text)
    return Response(status_code=204)


@router.patch("/", response_model=ProfileResponse)
def edit_profile(
    data: ProfileUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Kolla koden här så att en okänd kod ger ett tydligt fel i stället för
    # ett databasfel (500) från främmande nyckeln.
    if data.municipality_code is not None and db.get(Municipality, data.municipality_code) is None:
        raise HTTPException(status_code=422, detail=msg.UNKNOWN_MUNICIPALITY)
    # Ändras Om mig-texten (eller saknas vektorn) räknas en ny vektor samtidigt som texten kontrolleras. Skickas inte texten
    # med, eller är den oförändrad och har en vektor, görs inget anrop.
    pending_embedding = None
    if data.profile_text is not None:
        pending_embedding = start_embedding_if_needed(db, get_profile(db, current_user.id), data.profile_text)
    check_fields(name=data.name, profile_text=data.profile_text, district=data.district)
    if data.profile_text is not None:
        _check_profile_text(data.profile_text, current_user.id)
    try:
        profile = update_profile(db, current_user.id, data)
    except ProfileNotFoundError:
        raise HTTPException(status_code=404, detail=msg.PROFILE_NOT_FOUND)
    if data.profile_text is not None:
        store_profile_embedding(db, profile, pending_embedding)  # tar bort den gamla vektorn när texten har ändrats
    return _to_response(profile)


# Profilbild i två steg, så att själva bilden går direkt från webbläsaren
# till bucketen (Vercel begränsar anrop till backend till ca 4,5 MB):
#   1. POST /profile/image/upload-url  → länk att ladda upp till
#   2. webbläsaren laddar upp bilden (WebP, eller JPEG på iPhone) till länken
#   3. PUT  /profile/image              → backend kontrollerar filen och sparar den
def _require_storage():
    if not storage.is_configured():
        raise HTTPException(status_code=503, detail="Bilduppladdning är inte konfigurerad på servern")


@router.post("/image/upload-url", response_model=ProfileImageUploadUrl)
def create_profile_image_upload_url(
    data: ProfileImageUploadRequest | None = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_storage()
    if get_profile(db, current_user.id) is None:
        raise HTTPException(status_code=404, detail="Skapa din profil innan du lägger till en bild")
    content_type = (data or ProfileImageUploadRequest()).content_type
    key = storage.new_profile_image_key(current_user.id, content_type)
    return ProfileImageUploadUrl(
        upload_url=storage.create_upload_url(key, content_type),
        key=key,
        upload_headers=storage.upload_headers(content_type),
    )


@router.put("/image", response_model=ProfileResponse)
def confirm_profile_image(
    data: ProfileImageConfirm,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_storage()
    profile = get_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail=msg.PROFILE_NOT_FOUND)

    # Bara filer i användarens egen mapp, med ett namn vi själva har delat ut.
    prefix = f"profiles/{current_user.id}/"
    name = data.key.removeprefix(prefix)
    expected_type = storage.content_type_for_key(name)
    if not data.key.startswith(prefix) or "/" in name or expected_type is None:
        raise HTTPException(status_code=422, detail="Ogiltig bild")

    info = storage.get_object_info(data.key)
    if info is None:
        raise HTTPException(status_code=422, detail="Bilden hittades inte. Försök ladda upp igen.")
    # Filtypen måste stämma med filändelsen vi delade ut (en .jpg ska vara JPEG).
    if info["content_type"] != expected_type or info["size"] > storage.MAX_IMAGE_BYTES:
        storage.delete_object(data.key)
        raise HTTPException(status_code=422, detail="Bilden måste vara WebP eller JPEG och högst 2 MB")

    old_key = set_profile_image(db, profile, data.key)
    if old_key and old_key != data.key:
        storage.delete_object(old_key)
    return _to_response(profile)
