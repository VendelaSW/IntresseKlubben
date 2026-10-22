from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.core import error_messages as msg
from app.models.report import ReportReason, ReportTarget

MAX_COMMENT_LENGTH = 500


class ReportCreate(BaseModel):
    """POST /reports. `target_id` är användarens id för en profil, annars id:t på
    brevet, chattmeddelandet eller lappen."""

    target_type: ReportTarget
    target_id: int
    reason: ReportReason
    comment: str | None = None

    @field_validator("comment")
    @classmethod
    def comment_is_valid(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) > MAX_COMMENT_LENGTH:
            raise ValueError(msg.REPORT_COMMENT_TOO_LONG)
        return value or None


class ReportOut(BaseModel):
    """Svaret till den som anmäler: bara att anmälan är sparad."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
