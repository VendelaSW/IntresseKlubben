from datetime import datetime

from pydantic import BaseModel, field_validator, model_validator

from app.core import error_messages as msg
from app.models.group import GroupRole, GroupScope, GroupVisibility, SkillLevel
from app.schemas.contact import ContactUser
from app.schemas.position import check_position
from app.services.regions import COUNTRY_CODE

# Max antal medlemmar går att sätta mellan de här (SCRUM-216). Ägaren räknas.
MIN_MAX_MEMBERS = 2
MAX_MAX_MEMBERS = 1000


def _required_text(value: str, field: str, max_length: int, empty_message: str) -> str:
    value = value.strip()
    if len(value) == 0:
        raise ValueError(empty_message)
    if len(value) > max_length:
        raise ValueError(f"{field} får max vara {max_length} tecken")
    return value


class GroupCreate(BaseModel):
    name: str
    description: str
    meeting_info: str | None = None
    # Valfri träffplats: namn, adress och var på kartan (se schemas/position.py).
    place_name: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    # Att intresset och området finns kontrolleras i routen.
    interest_id: int
    # Räckvidden (SCRUM-282, se GroupScope). Förvalt kommun, som innan räckvidden fanns: då räcker
    # municipality_code. För de andra nivåerna anges området i scope_code (hela Sverige behöver ingen kod).
    scope: GroupScope = GroupScope.kommun
    scope_code: str | None = None
    municipality_code: str | None = None
    visibility: GroupVisibility = GroupVisibility.public
    # Av som standard bara ägaren. På: alla medlemmar får bjuda in.
    members_can_invite: bool = False
    # Valfritt: nivå och max antal medlemmar (SCRUM-216).
    skill_level: SkillLevel | None = None
    max_members: int | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty_or_too_long(cls, v: str) -> str:
        value = _required_text(v, "Namn", 30, "Namn får inte vara tomt")
        return value

    @field_validator("description")
    @classmethod
    def description_not_empty_or_too_long(cls, v: str) -> str:
        value = _required_text(v, "Beskrivning", 200, "Beskrivning får inte vara tom")
        return value

    @field_validator("meeting_info")
    @classmethod
    def meeting_info_empty_or_short(cls, v: str | None) -> str | None:
        # Valfritt fält: tom text sparas som inget värde.
        if v is None or v.strip() == "":
            return None
        # Tom text hanteras ovan, så empty_message används aldrig här.
        value = _required_text(v, "När och var ni träffas", 100, "")
        return value

    @field_validator("place_name", "address")
    @classmethod
    def place_empty_or_short(cls, v: str | None, info) -> str | None:
        # Valfria fält: tom text sparas som inget värde.
        if v is None or v.strip() == "":
            return None
        value = v.strip()
        if len(value) > 100:
            raise ValueError(msg.GROUP_PLACE_NAME_TOO_LONG if info.field_name == "place_name" else msg.GROUP_ADDRESS_TOO_LONG)
        return value

    @field_validator("max_members")
    @classmethod
    def max_members_in_range(cls, v: int | None) -> int | None:
        if v is not None and not MIN_MAX_MEMBERS <= v <= MAX_MAX_MEMBERS:
            raise ValueError(msg.GROUP_MAX_MEMBERS_RANGE)
        return v

    @model_validator(mode="after")
    def position_valid(self):
        check_position(self.latitude, self.longitude)
        return self

    @model_validator(mode="after")
    def area_given(self):
        """Fyller i scope_code och municipality_code efter räckvidden, så att de alltid hänger ihop: kommunen
        bara för räckvidden kommun (och då samma som scope_code), koden SE för hela Sverige."""
        if self.scope == GroupScope.kommun:
            code = self.municipality_code or self.scope_code
            if not code:
                raise ValueError(msg.GROUP_AREA_REQUIRED)
            self.scope_code = self.municipality_code = code
        elif self.scope == GroupScope.country:
            self.scope_code, self.municipality_code = COUNTRY_CODE, None
        else:
            if not self.scope_code:
                raise ValueError(msg.GROUP_AREA_REQUIRED)
            self.municipality_code = None
        return self


class GroupResponse(BaseModel):
    id: int
    name: str
    description: str
    meeting_info: str | None
    place_name: str | None
    address: str | None
    latitude: float | None
    longitude: float | None
    interest_id: int
    interest_name: str
    interest_area: str  # huvudområdet, som taggens färg följer (se Interest.area)
    # Räckvidden (se GroupCreate): nivå, områdets kod och namn ("Hela Sverige", "Norrland", "Göteborg").
    # Kommunen finns bara för räckvidden kommun.
    scope: GroupScope
    scope_code: str
    scope_name: str
    municipality_code: str | None
    municipality_name: str | None
    visibility: GroupVisibility
    members_can_invite: bool
    skill_level: SkillLevel | None
    max_members: int | None
    member_count: int
    # Har klubben nått max antal medlemmar? Då går det varken att gå med eller ansöka.
    is_full: bool
    # Gäller den inloggade användaren, så att frontend vet vilka knappar som ska visas.
    is_member: bool
    is_owner: bool
    # Får den inloggade bjuda in till klubben? Och har hen själv blivit inbjuden?
    can_invite: bool
    is_invited: bool
    # Har den inloggade ansökt (och väntar på svar)? Och hur många ansökningar väntar (bara för ägaren, annars 0)?
    has_applied: bool
    request_count: int
    created_at: datetime
    # Är någon den inloggade själv har blockerat med i gruppen? Bara för en
    # varning till den inloggade; vem det är syns inte (medlemslistan döljer
    # blockerade), och den som blockerat en själv räknas aldrig.
    has_blocked_member: bool


class GroupMemberResponse(BaseModel):
    # Publik vy av en medlem: aldrig e-post, födelsedatum eller kön. id används
    # för länken till medlemmens profil.
    id: int
    username: str
    name: str | None
    image_url: str | None
    role: GroupRole


class GroupInvite(BaseModel):
    # Kontakter efter id. Minst en krävs.
    user_ids: list[int]

    @model_validator(mode="after")
    def someone_is_invited(self):
        if not self.user_ids:
            raise ValueError(msg.GROUP_INVITE_NOBODY)
        return self


class GroupsOverview(BaseModel):
    """GET /groups/overview: klubbsidans tre listor i ett svar (samma som
    /groups/mine, /groups/suggested och /groups/invitations)."""

    mine: list[GroupResponse]
    suggested: list[GroupResponse]
    invitations: list[GroupResponse]


class GroupJoinRequestCreate(BaseModel):
    # Valfritt meddelande (SCRUM-159): den sökandes till ägaren, eller ägarens förklaring när ansökan nekas.
    # Tom text sparas som inget meddelande.
    message: str | None = None

    @field_validator("message")
    @classmethod
    def message_empty_or_short(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        value = v.strip()
        if len(value) > 200:
            raise ValueError(msg.GROUP_REQUEST_MESSAGE_TOO_LONG)
        return value


class GroupJoinRequestOut(BaseModel):
    """En ansökan som väntar på svar, för klubbens ägare."""

    user: ContactUser
    message: str | None
    created_at: datetime
