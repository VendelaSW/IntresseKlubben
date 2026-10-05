from datetime import datetime, timezone

from pydantic import BaseModel, field_validator, model_validator

from app.models.event import EventVisibility


def _required_text(value: str, field: str, max_length: int) -> str:
    value = value.strip()
    if len(value) == 0:
        raise ValueError(f"{field} får inte vara tom")
    if len(value) > max_length:
        raise ValueError(f"{field} får max vara {max_length} tecken")
    return value


def _to_utc(value: datetime) -> datetime:
    # Tid utan tidszon går inte att tolka säkert, så den avvisas. Allt sparas
    # som UTC.
    if value.tzinfo is None:
        raise ValueError("Ange tiden med tidszon")
    return value.astimezone(timezone.utc)


class EventCreate(BaseModel):
    title: str
    description: str
    # Att intresset och klubben finns kontrolleras i routen.
    interest_id: int
    starts_at: datetime
    ends_at: datetime | None = None
    place_name: str
    address: str
    # Säkrast om inget anges. Ett event i en privat klubb måste vara invite_only.
    visibility: EventVisibility = EventVisibility.invite_only
    group_id: int | None = None

    @field_validator("title")
    @classmethod
    def title_valid(cls, v: str) -> str:
        return _required_text(v, "Titel", 50)

    @field_validator("description")
    @classmethod
    def description_valid(cls, v: str) -> str:
        return _required_text(v, "Beskrivning", 800)

    @field_validator("place_name")
    @classmethod
    def place_name_valid(cls, v: str) -> str:
        return _required_text(v, "Platsnamn", 100)

    @field_validator("address")
    @classmethod
    def address_valid(cls, v: str) -> str:
        return _required_text(v, "Gatuadress", 100)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def time_has_timezone(cls, v: datetime | None) -> datetime | None:
        return None if v is None else _to_utc(v)

    @model_validator(mode="after")
    def times_make_sense(self):
        if self.starts_at <= datetime.now(timezone.utc):
            raise ValueError("Starttiden måste vara i framtiden")
        if self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("Sluttiden måste vara efter starttiden")
        return self


class EventOut(BaseModel):
    id: int
    title: str
    description: str
    interest_id: int
    interest_name: str
    starts_at: datetime
    ends_at: datetime | None
    place_name: str
    address: str
    visibility: EventVisibility
    group_id: int | None
    group_name: str | None
    # Skaparens publika uppgifter: aldrig e-post eller födelsedatum.
    creator_username: str
    creator_name: str | None
    # Gäller den inloggade användaren, så att frontend vet vilka knappar som ska visas.
    is_owner: bool
    created_at: datetime
