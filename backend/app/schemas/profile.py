from datetime import date

from pydantic import BaseModel, field_validator

from app.models.profile import GenderEnum


class ProfileUpdate(BaseModel):
    name: str | None = None
    birth_date: date | None = None
    gender: GenderEnum | None = None
    # SCB-kod från /municipalities/. Att koden finns kontrolleras i routen.
    municipality_code: str | None = None
    district: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty_or_too_long(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) == 0:
            raise ValueError("Namn får inte vara tomt")
        if len(v) > 50:
            raise ValueError("Namn får max vara 50 tecken")
        return v

    @field_validator("birth_date")
    @classmethod
    def birth_date_not_in_future(cls, v: date | None) -> date | None:
        if v is not None and v > date.today():
            raise ValueError("Födelsedatum kan inte vara i framtiden")
        return v

    @field_validator("district")
    @classmethod
    def district_not_empty_or_too_long(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) == 0:
            raise ValueError("Stadsdel får inte vara tom")
        if len(v) > 100:
            raise ValueError("Stadsdel får max vara 100 tecken")
        return v


class ProfileResponse(BaseModel):
    name: str | None
    # Bara birth_date lagras. age räknas ut från den vid varje anrop och
    # birth_date skickas med så att redigeringsformuläret kan förifyllas.
    birth_date: date | None
    age: int | None
    gender: GenderEnum | None
    municipality_code: str | None
    municipality_name: str | None
    district: str | None
    image_url: str | None


class ProfileImageUploadUrl(BaseModel):
    # Länk som webbläsaren laddar upp bilden till direkt (PUT, giltig i 5 min).
    upload_url: str
    # Filens namn i bucketen. Skickas tillbaka till PUT /profile/image efteråt.
    key: str


class ProfileImageConfirm(BaseModel):
    key: str