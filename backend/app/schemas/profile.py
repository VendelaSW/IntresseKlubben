from datetime import date
from typing import Literal

from pydantic import BaseModel, field_validator

from app.core import error_messages as msg
from app.models.profile import GenderEnum
from app.schemas.interest import ProfileInterest


def _clean_name(v: str) -> str:
    v = v.strip()
    if len(v) == 0:
        raise ValueError(msg.NAME_EMPTY)
    if len(v) > 50:
        raise ValueError(msg.NAME_TOO_LONG)
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
    return v


class ProfileTextCheck(BaseModel):
    """Om mig-texten att förhandskontrollera (POST /profile/text-check), med samma regler för längd och språk som
    när profilen sparas."""

    profile_text: str

    @field_validator("profile_text")
    @classmethod
    def validate_profile_text(cls, v: str) -> str:
        return _clean_profile_text(v)


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
    # Dölj åldern för andra (SCRUM-134).
    age_hidden: bool = False

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
    ändras, och de obligatoriska fälten kan ändras men aldrig tas bort. Den
    valfria stadsdelen tas bort med district: null."""

    name: str | None = None
    birth_date: date | None = None
    gender: GenderEnum | None = None
    # SCB-kod från /municipalities/. Att koden finns kontrolleras i routen.
    municipality_code: str | None = None
    district: str | None = None
    profile_text: str | None = None
    gender_searchable: bool | None = None
    # Dölj åldern för andra (SCRUM-134).
    age_hidden: bool | None = None

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
    age_hidden: bool
    municipality_code: str | None
    municipality_name: str | None
    district: str | None
    image_url: str | None
    profile_text: str | None


class PublicProfileResponse(BaseModel):
    # Mindre "skyltfönster" av en profil - det som visas för NÅGON ANNANS
    # profil (t.ex. GET /users/{user_id}/profile). Innehåller aldrig
    # födelsedatum, kön eller kommunkoden, bara det ett ticket faktiskt
    # ska visa för andra. Intressena syns redan på personkorten (PersonResponse),
    # så de är inte privata.
    name: str | None
    # None om personen har dolt sin ålder (SCRUM-134), utom för moderatorer, som alltid ser den och då
    # får age_hidden True.
    age: int | None
    age_hidden: bool = False
    municipality_name: str | None
    district: str | None
    image_url: str | None
    profile_text: str | None
    interests: list[ProfileInterest]


class AreaCounts(BaseModel):
    """GET /users/area-counts: hur många andra användare som finns per område, för kartan (SCRUM-82). Nycklarna är
    kommunkod, landskapskod och "landskap:län". null betyder färre än 5, och ett område där ingen finns är inte med."""

    kommun: dict[str, int | None]
    landskap: dict[str, int | None]
    lan: dict[str, int | None]


class PersonResponse(BaseModel):
    # Används i listan över andra användare (filtrera/föreslå) - precis som
    # PublicProfileResponse, men med id (för att länka till /anvandare/{id}),
    # username och interests (för taggar och matchning).
    # Aldrig birth_date, gender eller e-post.
    id: int
    username: str
    name: str | None
    # Som i PublicProfileResponse: None om åldern är dold, utom för moderatorer.
    age: int | None
    age_hidden: bool = False
    municipality_name: str | None
    district: str | None
    image_url: str | None
    interests: list[ProfileInterest]


class ProfileImageUploadRequest(BaseModel):
    # Filtypen frontend gjorde bilden till: WebP, eller JPEG där webbläsaren
    # inte kan skapa WebP (iPhone). Utan värde WebP, som förut.
    content_type: Literal["image/webp", "image/jpeg"] = "image/webp"


class ProfileImageUploadUrl(BaseModel):
    # Länk som webbläsaren laddar upp bilden till direkt (PUT, giltig i 5 min).
    upload_url: str
    # Filens namn i bucketen. Skickas tillbaka till PUT /profile/image efteråt.
    key: str
    # Headrarna uppladdningen ska skickas med. De ingår i länkens signatur.
    upload_headers: dict[str, str]


class ProfileImageConfirm(BaseModel):
    key: str