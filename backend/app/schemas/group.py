from datetime import datetime

from pydantic import BaseModel, field_validator

from app.core.profanity import validate_clean_text
from app.models.group import GroupRole, GroupVisibility


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
    # Att intresset och kommunen finns kontrolleras i routen.
    interest_id: int
    municipality_code: str
    visibility: GroupVisibility = GroupVisibility.public

    @field_validator("name")
    @classmethod
    def name_not_empty_or_too_long(cls, v: str) -> str:
        value = _required_text(v, "Namn", 30, "Namn får inte vara tomt")
        validate_clean_text(value, "Gruppnamnet")
        return value

    @field_validator("description")
    @classmethod
    def description_not_empty_or_too_long(cls, v: str) -> str:
        value = _required_text(v, "Beskrivning", 200, "Beskrivning får inte vara tom")
        validate_clean_text(value, "Beskrivningen")
        return value

    @field_validator("meeting_info")
    @classmethod
    def meeting_info_empty_or_short(cls, v: str | None) -> str | None:
        # Valfritt fält: tom text sparas som inget värde.
        if v is None or v.strip() == "":
            return None
        # Tom text hanteras ovan, så empty_message används aldrig här.
        value = _required_text(v, "När och var ni träffas", 100, "")
        validate_clean_text(value, "Mötesinformationen")
        return value


class GroupResponse(BaseModel):
    id: int
    name: str
    description: str
    meeting_info: str | None
    interest_id: int
    interest_name: str
    municipality_code: str
    municipality_name: str
    visibility: GroupVisibility
    member_count: int
    # Gäller den inloggade användaren, så att frontend vet vilka knappar som ska visas.
    is_member: bool
    is_owner: bool
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
