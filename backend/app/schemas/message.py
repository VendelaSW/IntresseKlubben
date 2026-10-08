from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.contact import ContactUser


class MessageCreate(BaseModel):
    # Mottagaren identifieras med id, som överallt i API:t (användarnamn ska
    # aldrig synas i adresser).
    recipient_id: int
    text: str

    @field_validator("text")
    @classmethod
    def text_not_empty_or_too_long(cls, v: str) -> str:
        v = v.strip()
        if len(v) == 0:
            raise ValueError("Meddelandet får inte vara tomt")
        if len(v) > 2000:
            raise ValueError("Meddelandet får max vara 2000 tecken")
        return v


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    recipient_id: int
    text: str
    created_at: datetime


class ConversationResponse(BaseModel):
    # En rad i inkorgen: den andra personen (publikt, aldrig e-post/
    # födelsedatum) + en förhandsvisning av senaste meddelandet. id används
    # för länken till konversationen.
    id: int
    username: str
    name: str | None
    image_url: str | None
    last_message: str
    last_message_at: datetime
    # True om den inloggade själv skrev senaste meddelandet. Då är det inget
    # nytt brev, och siffran på brev-loggan ska inte räkna det.
    last_message_from_me: bool


class ConversationDetail(BaseModel):
    # Hela konversationen med en person (GET /messages/{user_id}): vem det är
    # (publikt, som i kontaktlistan) och alla brev, äldst först. Personen
    # följer med så att sidan kan visa namnet utan något eget anrop.
    user: ContactUser
    messages: list[MessageOut]
