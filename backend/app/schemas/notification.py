from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.core import error_messages as msg

MAX_CANCEL_MESSAGE_LENGTH = 300


class NotificationActorOut(BaseModel):
    """Personen en notis gäller, som andra användare visas: bara id, namn och profilbild (inget privat)."""

    id: int
    name: str
    profile_image_url: str | None


class NotificationOut(BaseModel):
    """En notis från Intresseklubben (GET /notifications). Allmän: en rubrik, en valfri text, ett valfritt citat
    (`quote`, från `quote_by`) och en valfri länk till sidan i appen den gäller. `kind` säger vad den gäller (se
    NotificationKind), och `actor` vilken person den gäller, om någon (se crud/notification.py)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    title: str
    body: str | None
    quote: str | None
    quote_by: str | None
    link: str | None
    created_at: datetime
    read: bool
    actor: NotificationActorOut | None = None


class EventCancel(BaseModel):
    """Skaparens valfria meddelande till deltagarna när eventet ställs in (DELETE /events/{id})."""

    message: str | None = None

    @field_validator("message")
    @classmethod
    def message_is_valid(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) > MAX_CANCEL_MESSAGE_LENGTH:
            raise ValueError(msg.EVENT_CANCEL_MESSAGE_TOO_LONG)
        return value or None
