from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.contact import ContactUser
from app.schemas.text import message_text


class MessageCreate(BaseModel):
    # Mottagaren identifieras med id, som överallt i API:t (användarnamn ska
    # aldrig synas i adresser).
    recipient_id: int
    text: str

    @field_validator("text")
    @classmethod
    def text_not_empty_or_too_long(cls, v: str) -> str:
        return message_text(v)


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
    # True om den inloggade själv skrev senaste meddelandet (Från/Till på kuvertet).
    last_message_from_me: bool
    # True om den andra har skrivit något som den inloggade inte har läst än
    # (se mark_conversation_read). Sparas på kontot, inte i webbläsaren.
    unread: bool


class ConversationDetail(BaseModel):
    # Hela konversationen med en person (GET /messages/{user_id}): vem det är
    # (publikt, som i kontaktlistan) och alla brev, äldst först. Personen
    # följer med så att sidan kan visa namnet utan något eget anrop.
    user: ContactUser
    messages: list[MessageOut]
