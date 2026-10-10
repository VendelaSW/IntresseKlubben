from pydantic import BaseModel, Field, field_validator

from app.core import error_messages as msg

# Så mycket text skickas som mest till språkmodellen (profiltexten är max 800 tecken).
MAX_TEXT_LENGTH = 1000


class InterestExtractRequest(BaseModel):
    text: str = Field(max_length=MAX_TEXT_LENGTH)

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError(msg.DEMO_TEXT_EMPTY)
        return value


class ExtractedInterest(BaseModel):
    # En huvudtagg, t.ex. "fotografi", med undertaggar för specifika varianter, t.ex.
    # ["analogt fotografi", "gatufotografi"]. Undertaggarna kan vara en tom lista.
    name: str
    subtags: list[str]


class InterestExtractResponse(BaseModel):
    interests: list[ExtractedInterest]
