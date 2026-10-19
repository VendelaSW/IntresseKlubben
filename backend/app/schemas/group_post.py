from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.core import error_messages as msg

MAX_POST_LENGTH = 2000


class GroupPostCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty_or_too_long(cls, v: str) -> str:
        v = v.strip()
        if len(v) == 0:
            raise ValueError(msg.GROUP_POST_EMPTY)
        if len(v) > MAX_POST_LENGTH:
            raise ValueError(msg.GROUP_POST_TOO_LONG)
        return v


class GroupPostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    author_id: int
    content: str
    created_at: datetime
