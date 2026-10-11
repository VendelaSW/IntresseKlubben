from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class GroupMessageCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty_or_too_long(cls, v: str) -> str:
        v = v.strip()
        if len(v) == 0:
            raise ValueError("Meddelandet får inte vara tomt")
        if len(v) > 2000:
            raise ValueError("Meddelandet får max vara 2000 tecken")
        return v


class GroupMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    sender_id: int
    content: str
    created_at: datetime
