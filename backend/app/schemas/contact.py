from typing import Literal

from pydantic import BaseModel, ConfigDict


class ContactRequest(BaseModel):
    # Mottagaren anges med id. Användarnamn används aldrig för att peka ut
    # någon i API:t (de ska inte synas i adresser, se CONTRIBUTING.md).
    addressee_id: int


class ContactAnswer(BaseModel):
    action: Literal["accept", "reject"]


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    requester_id: int
    addressee_id: int
    status: Literal["PENDING", "ACCEPTED", "BLOCKED"]


class BlockResponse(ContactResponse):
    pass


class ContactUser(BaseModel):
    # Public view of another user: never email or birth date.
    id: int
    username: str
    name: str | None
    image_url: str | None


class ContactListItem(ContactResponse):
    user: ContactUser


class ContactListResponse(BaseModel):
    contacts: list[ContactListItem]
    incoming_requests: list[ContactListItem]
    outgoing_requests: list[ContactListItem]