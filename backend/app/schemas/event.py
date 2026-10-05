from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.core import error_messages as msg
from app.models.event import EventAnswer, EventVisibility
from app.schemas.contact import ContactUser


def _required_text(value: str, max_length: int, empty_message: str, too_long_message: str) -> str:
    value = value.strip()
    if len(value) == 0:
        raise ValueError(empty_message)
    if len(value) > max_length:
        raise ValueError(too_long_message)
    return value


def _title(value: str) -> str:
    return _required_text(value, 50, msg.EVENT_TITLE_EMPTY, msg.EVENT_TITLE_TOO_LONG)


def _description(value: str) -> str:
    return _required_text(value, 800, msg.EVENT_DESCRIPTION_EMPTY, msg.EVENT_DESCRIPTION_TOO_LONG)


def _place_name(value: str) -> str:
    return _required_text(value, 100, msg.EVENT_PLACE_NAME_EMPTY, msg.EVENT_PLACE_NAME_TOO_LONG)


def _address(value: str) -> str:
    return _required_text(value, 100, msg.EVENT_ADDRESS_EMPTY, msg.EVENT_ADDRESS_TOO_LONG)


def _to_utc(value: datetime) -> datetime:
    # Tid utan tidszon går inte att tolka säkert, så den avvisas. Allt sparas
    # som UTC.
    if value.tzinfo is None:
        raise ValueError(msg.EVENT_TIME_NEEDS_TIMEZONE)
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
        return _title(v)

    @field_validator("description")
    @classmethod
    def description_valid(cls, v: str) -> str:
        return _description(v)

    @field_validator("place_name")
    @classmethod
    def place_name_valid(cls, v: str) -> str:
        return _place_name(v)

    @field_validator("address")
    @classmethod
    def address_valid(cls, v: str) -> str:
        return _address(v)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def time_has_timezone(cls, v: datetime | None) -> datetime | None:
        return None if v is None else _to_utc(v)

    @model_validator(mode="after")
    def times_make_sense(self):
        if self.starts_at <= datetime.now(timezone.utc):
            raise ValueError(msg.EVENT_START_IN_PAST)
        if self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError(msg.EVENT_END_BEFORE_START)
        return self


class EventUpdate(BaseModel):
    """Ändringar i ett event. Bara de fält som skickas ändras, och de
    obligatoriska fälten kan inte tömmas. Sluttiden kan tas bort med null.
    Klubb, skapare och synlighet går inte att ändra, och försöker man skickas
    ett fel i stället för att fältet tyst hoppas över."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    interest_id: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    place_name: str | None = None
    address: str | None = None

    @field_validator("title")
    @classmethod
    def title_valid(cls, v: str | None) -> str:
        return _title(v or "")

    @field_validator("description")
    @classmethod
    def description_valid(cls, v: str | None) -> str:
        return _description(v or "")

    @field_validator("place_name")
    @classmethod
    def place_name_valid(cls, v: str | None) -> str:
        return _place_name(v or "")

    @field_validator("address")
    @classmethod
    def address_valid(cls, v: str | None) -> str:
        return _address(v or "")

    @field_validator("interest_id")
    @classmethod
    def interest_not_empty(cls, v: int | None) -> int:
        if v is None:
            raise ValueError(msg.EVENT_INTEREST_REQUIRED)
        return v

    @field_validator("starts_at")
    @classmethod
    def starts_at_valid(cls, v: datetime | None) -> datetime:
        if v is None:
            raise ValueError(msg.EVENT_START_EMPTY)
        v = _to_utc(v)
        if v <= datetime.now(timezone.utc):
            raise ValueError(msg.EVENT_START_IN_PAST)
        return v

    @field_validator("ends_at")
    @classmethod
    def ends_at_has_timezone(cls, v: datetime | None) -> datetime | None:
        return None if v is None else _to_utc(v)


class EventInvite(BaseModel):
    # Kontakter efter användarnamn, och/eller klubbar vars medlemmar alla ska
    # bjudas in. Minst en av dem krävs.
    usernames: list[str] = []
    group_ids: list[int] = []

    @model_validator(mode="after")
    def someone_is_invited(self):
        if not self.usernames and not self.group_ids:
            raise ValueError(msg.EVENT_INVITE_NOBODY)
        return self


class EventAnswerIn(BaseModel):
    answer: EventAnswer


class EventAttendee(ContactUser):
    # En person som har svarat på eventet, med sitt svar.
    answer: EventAnswer


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
    is_invited: bool
    # Den inloggades eget svar, eller None om hen inte har svarat.
    my_answer: EventAnswer | None
    created_at: datetime
