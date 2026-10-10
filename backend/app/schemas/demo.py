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


class ExtractedSub(BaseModel):
    # Något specifikt inom ett intresse, t.ex. "gatufotografi", med andra ord för samma sak (alias).
    name: str
    aliases: list[str]


class ExtractedInterest(BaseModel):
    # Ett intresse, t.ex. "fotografering", med alias och subs (listorna kan vara tomma). `category`
    # är en av våra kategorier (t.ex. "Foto & video") som ett osynligt fält för filtrering, eller None
    # om kategoriseringen är avstängd. Den visas inte för användaren.
    name: str
    aliases: list[str]
    category: str | None
    subtags: list[ExtractedSub]


class InterestExtractResponse(BaseModel):
    interests: list[ExtractedInterest]
