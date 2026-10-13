from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.models.profile import GenderEnum
from app.schemas.profile import (
    ProfileResponse,
    _check_birth_date,
    _clean_district,
    _clean_municipality_code,
    _clean_name,
    _clean_profile_text,
)

MAX_BATCHES = 10
MAX_ITEMS = 30
MAX_ACTIVITIES = 8


class ApprovedItemIn(BaseModel):
    """Ett förslag användaren godkänt. Förslag som inte skickas med räknas som bortvalda."""

    key: str = Field(min_length=1, max_length=20)  # förslagets nyckel i analysen (p1, p2...)
    # Hur man håller på med det. En aktivitet i `activity` eller flera i `activities` (eller båda): varje blir en rad.
    activity: str | None = Field(default=None, max_length=40)
    activities: list[str] = Field(default_factory=list, max_length=MAX_ACTIVITIES)
    # Svaret på "Något särskilt inom musik?": id på de valda underintressena, som tar området plats.
    narrow_to: list[int] = Field(default_factory=list, max_length=30)

    @property
    def all_activities(self) -> tuple[str, ...]:
        chosen = [self.activity] if self.activity else []
        return tuple(dict.fromkeys(a for a in [*chosen, *self.activities] if a))

    @field_validator("activities")
    @classmethod
    def only_text(cls, value: list[str]) -> list[str]:
        return [a for a in value if isinstance(a, str) and len(a) <= 40]


class BatchIn(BaseModel):
    token: str = Field(min_length=1, max_length=8000)  # sigillet från analysen
    items: list[ApprovedItemIn] = Field(max_length=MAX_ITEMS)


class ConfirmInterestsRequest(BaseModel):
    """POST /profile/interests/confirm: förslag från ett eller flera analyze-svar."""

    batches: list[BatchIn] = Field(min_length=1, max_length=MAX_BATCHES)


class UserInterestOut(BaseModel):
    """En av användarens intressen. Samma intresse med två aktiviteter är två rader."""

    id: int
    name: str
    activity: str  # "" = ingen aktivitet
    label: str | None


class ConfirmInterestsResponse(BaseModel):
    interests: list[UserInterestOut]


class CompleteProfileRequest(BaseModel):
    """POST /profile/interview/complete: en helt ny profil och dess intressen i ett anrop, när intervjun är klar.
    Samma fält som POST /profile/, men intressena kommer som godkända förslag i stället för id:n."""

    name: str
    birth_date: date
    gender: GenderEnum
    municipality_code: str
    profile_text: str
    batches: list[BatchIn] = Field(min_length=1, max_length=MAX_BATCHES)
    district: str | None = None
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


class CompleteProfileResponse(BaseModel):
    profile: ProfileResponse
    interests: list[UserInterestOut]
