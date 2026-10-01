from typing import Literal

from pydantic import BaseModel, ConfigDict


class ContactRequest(BaseModel):
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


class ContactListResponse(BaseModel):
    contacts: list[ContactResponse]
    incoming_requests: list[ContactResponse]
    outgoing_requests: list[ContactResponse]