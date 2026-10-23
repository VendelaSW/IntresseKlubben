from datetime import datetime

from pydantic import BaseModel, field_validator

from app.core import error_messages as msg
from app.crud.moderation import SUSPENSION_DAYS
from app.models.report import ReportReason


class PersonRef(BaseModel):
    id: int
    name: str


class SuspensionOut(BaseModel):
    starts_at: datetime
    until: datetime | None  # None = tills vidare
    reason: str
    lifted_at: datetime | None


class ReportedUser(PersonRef):
    """Den anmälda, med det moderatorn behöver för att bestämma vad som ska hända:
    hur många gånger hen har anmälts, avstängningen som gäller nu och tidigare
    avstängningar (äldsta först)."""

    report_count: int
    suspension: SuspensionOut | None
    previous_suspensions: list[SuspensionOut]


class ModerationReportOut(BaseModel):
    """En anmälan i moderatorns lista (GET /moderation/reports). `reported` och
    `reporter` är None om kontot har raderats. `group_name` är klubben för ett
    chattmeddelande eller en lapp, om den finns kvar."""

    id: int
    target_type: str
    target_id: int | None
    group_name: str | None
    content: str | None
    reason: str
    comment: str | None
    created_at: datetime
    handled_at: datetime | None
    handled_by: str | None
    reported: ReportedUser | None
    reporter: PersonRef | None


class SuspendIn(BaseModel):
    """PUT /moderation/users/{id}/suspension. `days` är 1, 7 eller 30, eller None för tills vidare."""

    days: int | None
    reason: ReportReason

    @field_validator("days")
    @classmethod
    def days_is_allowed(cls, value: int | None) -> int | None:
        if value not in SUSPENSION_DAYS:
            raise ValueError(msg.SUSPENSION_DAYS_INVALID)
        return value
