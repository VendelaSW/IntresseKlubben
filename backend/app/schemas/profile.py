from datetime import date

from pydantic import BaseModel, field_validator

from app.core import error_messages as msg
from app.core.profanity import validate_clean_text
from app.models.profile import GenderEnum
from app.schemas.interest import InterestResponse


def _clean_name(v: str) -> str:
    v = v.strip()
    if len(v) == 0:
        raise ValueError(msg.NAME_EMPTY)
    if len(v) > 50:
        raise ValueError(msg.NAME_TOO_LONG)
    validate_clean_text(v, "Namnet")
    return v


def _check_birth_date(v: date) -> date:
    if v > date.today():
        raise ValueError(msg.BIRTH_DATE_IN_FUTURE)
    return v


def _clean_municipality_code(v: str) -> str:
    v = v.strip()
    if len(v) == 0:
        raise ValueError(msg.MUNICIPALITY_REQUIRED)
    return v


def _clean_district(v: str) -> str:
    v = v.strip()
    if len(v) == 0:
        raise ValueError(msg.DISTRICT_EMPTY)
    if len(v) > 100:
        raise ValueError(msg.DISTRICT_TOO_LONG)
    return v


def _clean_profile_text(v: str) -> str:
    v = v.strip()
    if len(v) == 0:
        raise ValueError(msg.PROFILE_TEXT_EMPTY)
    if len(v) > 800:
        raise ValueError(msg.PROFILE_TEXT_TOO_LONG)
    validate_clean_text(v, "Om mig-texten")
    return v


class ProfileCreate(BaseModel):
    """Skapa en profil (POST /profile/). Alla obligatoriska fält måste vara med,
    plus minst ett intresse, som sparas i samma anrop så att en profil aldrig
    finns utan intresse. Stadsdel och bild är valfria."""

    name: str
    birth_date: date
    gender: GenderEnum
    # SCB-kod från /municipalities/. Att koden finns kontrolleras i routen.
    municipality_code: str
    profile_text: str
    # De valda intressena blir användarens intressen (ersätter ev. tidigare).
    interest_ids: list[int]
    district: str | None = None
    # Får andra hitta en när de filtrerar Personer på kön? Av som standard.
    gender_searchable: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _clean_name(v)

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, v: date) -> date:
        return _check_birth_date(v)

    @field_validator("municipality_code")
    @classmethod
    def validate_municipality_code(cls, v: str) -> str:
        return _clean_municipality_code(v)

    @field_validator("profile_text")
    @classmethod
    def validate_profile_text(cls, v: str) -> str:
        return _clean_profile_text(v)

    @field_validator("district")
    @classmethod
    def validate_district(cls, v: str | None) -> str | None:
        return None if v is None else _clean_district(v)

    @field_validator("interest_ids")
    @classmethod
    def at_least_one_interest(cls, v: list[int]) -> list[int]:
        unique = list(dict.fromkeys(v))
        if len(unique) == 0:
            raise ValueError(msg.INTERESTS_REQUIRED)
        return unique


class ProfileUpdate(BaseModel):
    """Ändra en befintlig profil (PATCH /profile/). Bara fält som skickas med
    ändras, och de obligatoriska fälten kan ändras men aldrig tas bort."""

    name: str | None = None
    birth_date: date | None = None
    gender: GenderEnum | None = None
    # SCB-kod från /municipalities/. Att koden finns kontrolleras i routen.
    municipality_code: str | None = None
    district: str | None = None
    profile_text: str | None = None
    gender_searchable: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, v: date | None) -> date | None:
        return None if v is None else _check_birth_date(v)

    @field_validator("municipality_code")
    @classmethod
    def validate_municipality_code(cls, v: str | None) -> str | None:
        return None if v is None else _clean_municipality_code(v)

    @field_validator("district")
    @classmethod
    def validate_district(cls, v: str | None) -> str | None:
        return None if v is None else _clean_district(v)

    @field_validator("profile_text")
    @classmethod
    def validate_profile_text(cls, v: str | None) -> str | None:
        return None if v is None else _clean_profile_text(v)


class ProfileResponse(BaseModel):
    name: str | None
    # Bara birth_date lagras. age räknas ut från den vid varje anrop och
    # birth_date skickas med så att redigeringsformuläret kan förifyllas.
    birth_date: date | None
    age: int | None
    gender: GenderEnum | None
    gender_searchable: bool
    municipality_code: str | None
    municipality_name: str | None
    district: str | None
    image_url: str | None
    profile_text: str | None


class PublicProfileResponse(BaseModel):
    # Mindre "skyltfönster" av en profil - det som visas för NÅGON ANNANS
    # profil (t.ex. GET /users/{username}/profile). Innehåller aldrig
    # födelsedatum, kön eller kommunkoden, bara det ett ticket faktiskt
    # ska visa för andra. Intressena syns redan på personkorten (PersonResponse),
    # så de är inte privata.
    name: str | None
    age: int | None
    municipality_name: str | None
    district: str | None
    image_url: str | None
    profile_text: str | None
    interests: list[InterestResponse]


class PersonResponse(BaseModel):
    # Används i listan över andra användare (filtrera/föreslå) - precis som
    # PublicProfileResponse, men med username (för att länka till
    # /anvandare/{username}) och interests (för taggar och matchning).
    # Aldrig birth_date, gender eller e-post.
    username: str
    name: str | None
    age: int | None
    municipality_name: str | None
    district: str | None
    image_url: str | None
    interests: list[InterestResponse]


class ProfileImageUploadUrl(BaseModel):
    # Länk som webbläsaren laddar upp bilden till direkt (PUT, giltig i 5 min).
    upload_url: str
    # Filens namn i bucketen. Skickas tillbaka till PUT /profile/image efteråt.
    key: str


class ProfileImageConfirm(BaseModel):
    key: str