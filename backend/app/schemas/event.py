from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.core import error_messages as msg
from app.models.event import EventAnswer, EventVisibility
from app.models.group import GroupScope, SkillLevel
from app.schemas.contact import ContactUser
from app.schemas.position import check_position
from app.services.regions import COUNTRY_CODE

# Max antal deltagare går att sätta mellan de här (SCRUM-293).
MIN_MAX_ATTENDEES = 2
MAX_MAX_ATTENDEES = 1000


def _max_attendees(value: int | None) -> int | None:
    if value is not None and not MIN_MAX_ATTENDEES <= value <= MAX_MAX_ATTENDEES:
        raise ValueError(msg.EVENT_MAX_ATTENDEES_RANGE)
    return value


def _area(scope: GroupScope | None, scope_code: str | None) -> tuple[GroupScope | None, str | None]:
    """Eventets område (SCRUM-295): inget (platsen räcker), eller ett län, landskap, en landsdel eller hela
    Sverige. Kommun går inte: då hör eventet till sin plats, som förut. Att området finns kollas i routen."""
    if scope is None:
        return None, None
    if scope == GroupScope.kommun:
        raise ValueError(msg.EVENT_AREA_KOMMUN)
    if scope == GroupScope.country:
        return scope, COUNTRY_CODE
    if not scope_code:
        raise ValueError(msg.EVENT_AREA_REQUIRED)
    return scope, scope_code


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
    # Var på kartan, valfritt (se schemas/position.py).
    latitude: float | None = None
    longitude: float | None = None
    # Säkrast om inget anges. Ett event i en privat klubb måste vara invite_only.
    visibility: EventVisibility = EventVisibility.invite_only
    group_id: int | None = None
    # Av som standard: bara skaparen bjuder in.
    guests_can_invite: bool = False
    # Valfritt område (SCRUM-295), nivå och max antal som kommer (SCRUM-293).
    scope: GroupScope | None = None
    scope_code: str | None = None
    skill_level: SkillLevel | None = None
    max_attendees: int | None = None

    @field_validator("max_attendees")
    @classmethod
    def max_attendees_valid(cls, v: int | None) -> int | None:
        return _max_attendees(v)

    @model_validator(mode="after")
    def area_valid(self):
        self.scope, self.scope_code = _area(self.scope, self.scope_code)
        return self

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

    @model_validator(mode="after")
    def position_valid(self):
        check_position(self.latitude, self.longitude)
        return self


class EventUpdate(BaseModel):
    """Ändringar i ett event. Bara de fält som skickas ändras, och de
    obligatoriska fälten kan inte tömmas. Sluttiden kan tas bort med null, och
    positionen med latitude och longitude null (båda skickas alltid ihop).
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
    latitude: float | None = None
    longitude: float | None = None
    guests_can_invite: bool | None = None
    # Område, nivå och max antal (SCRUM-293, SCRUM-295). null tar bort dem. Området skickas med båda fälten,
    # utom hela Sverige och inget område, som räcker med scope.
    scope: GroupScope | None = None
    scope_code: str | None = None
    skill_level: SkillLevel | None = None
    max_attendees: int | None = None

    @field_validator("max_attendees")
    @classmethod
    def max_attendees_valid(cls, v: int | None) -> int | None:
        return _max_attendees(v)

    @model_validator(mode="after")
    def area_valid(self):
        if "scope" in self.model_fields_set:
            self.scope, self.scope_code = _area(self.scope, self.scope_code)
            self.model_fields_set.add("scope_code")
        elif "scope_code" in self.model_fields_set:
            raise ValueError(msg.EVENT_AREA_REQUIRED)
        return self

    @model_validator(mode="after")
    def position_valid(self):
        sent = {"latitude", "longitude"} & self.model_fields_set
        if sent and sent != {"latitude", "longitude"}:
            raise ValueError(msg.POSITION_INCOMPLETE)
        if sent:
            check_position(self.latitude, self.longitude)
        return self

    @field_validator("guests_can_invite")
    @classmethod
    def guests_can_invite_not_empty(cls, v: bool | None) -> bool:
        if v is None:
            raise ValueError(msg.EVENT_GUESTS_CAN_INVITE_EMPTY)
        return v

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
    # Kontakter (användar-id), och/eller klubbar vars medlemmar alla ska
    # bjudas in. Minst en av dem krävs.
    user_ids: list[int] = []
    group_ids: list[int] = []

    @model_validator(mode="after")
    def someone_is_invited(self):
        if not self.user_ids and not self.group_ids:
            raise ValueError(msg.EVENT_INVITE_NOBODY)
        return self


class EventAnswerIn(BaseModel):
    answer: EventAnswer


class EventAttendee(ContactUser):
    # En person som har svarat på eventet, med sitt svar.
    answer: EventAnswer
    # True om den inloggade själv har blockerat personen. Frontend visar då en
    # varning. Den som har blockerat den inloggade syns aldrig här.
    blocked_by_me: bool = False


class EventOut(BaseModel):
    id: int
    title: str
    description: str
    interest_id: int
    interest_name: str
    interest_area: str  # huvudområdet, som taggens färg följer (se Interest.area)
    starts_at: datetime
    ends_at: datetime | None
    place_name: str
    address: str
    latitude: float | None
    longitude: float | None
    visibility: EventVisibility
    # Område (SCRUM-295): inget (None), eller ett län, landskap, en landsdel eller hela Sverige, med namn.
    scope: GroupScope | None
    scope_code: str | None
    scope_name: str | None
    # Nivå och max antal som kommer (SCRUM-293). yes_count är hur många som har svarat Ja.
    skill_level: SkillLevel | None
    max_attendees: int | None
    yes_count: int
    is_full: bool
    group_id: int | None
    group_name: str | None
    # Går klubben att öppna för den inloggade? Då är namnet en länk till klubben.
    group_visible: bool
    # Skaparens publika uppgifter: aldrig e-post eller födelsedatum. creator_id
    # används för länken till skaparens profil.
    creator_id: int
    creator_username: str
    creator_name: str | None
    # Gäller den inloggade användaren, så att frontend vet vilka knappar som ska visas.
    is_owner: bool
    # Skaparen eller en medarrangör (SCRUM-296): får ändra eventet, bjuda in och svara på ansökningar.
    is_host: bool
    # Medarrangörernas id (inte skaparen), för att visa dem bland deltagarna.
    host_ids: list[int]
    # Får den inloggade svara? Nej på ett event man ansöker till, tills ansökan är godkänd.
    can_answer: bool
    # Har den inloggade ansökt (och väntar på svar)? Och hur många ansökningar väntar (bara för skaparen och
    # medarrangörerna, annars 0)?
    has_applied: bool
    request_count: int
    # Får den inloggade bjuda in till eventet (skaparen, eller alla om
    # guests_can_invite är på). Frontend visar knappen "Bjud in" utifrån den här.
    can_invite: bool
    guests_can_invite: bool
    is_invited: bool
    # Den inloggades eget svar, eller None om hen inte har svarat.
    my_answer: EventAnswer | None
    created_at: datetime
