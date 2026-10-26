from datetime import datetime

from pydantic import BaseModel, field_validator, model_validator

from app.core import error_messages as msg
from app.models.group import GroupRole, GroupVisibility
from app.schemas.position import check_position


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
    # Att intresset och kommunen finns kontrolleras i routen.
    interest_id: int
    municipality_code: str
    visibility: GroupVisibility = GroupVisibility.public
    # Av som standard bara ägaren. På: alla medlemmar får bjuda in.
    members_can_invite: bool = False

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

    @model_validator(mode="after")
    def position_valid(self):
        check_position(self.latitude, self.longitude)
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
    # Huvudområdet och dess slug, som taggens färg följer (se crud/interest.py, InterestPlace).
    interest_area: str
    interest_area_slug: str | None
    municipality_code: str
    municipality_name: str
    visibility: GroupVisibility
    members_can_invite: bool
    member_count: int
    # Gäller den inloggade användaren, så att frontend vet vilka knappar som ska visas.
    is_member: bool
    is_owner: bool
    # Får den inloggade bjuda in till klubben? Och har hen själv blivit inbjuden?
    can_invite: bool
    is_invited: bool
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
