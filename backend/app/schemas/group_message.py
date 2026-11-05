from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.text import message_text


class GroupMessageCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty_or_too_long(cls, v: str) -> str:
        return message_text(v)


class GroupMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    sender_id: int
    content: str
    created_at: datetime
