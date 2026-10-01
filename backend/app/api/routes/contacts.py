from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.crud import contact as contact_crud
from app.db.session import get_db
from app.models.user import User
from app.schemas.contact import (BlockResponse, ContactAnswer, ContactListResponse,
                                 ContactRequest, ContactResponse)

router = APIRouter(tags=["contacts"])


@router.get("/contacts", response_model=ContactListResponse)
def list_contacts(db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    return contact_crud.list_contacts(db, current_user.id)


@router.post("/contacts/request", response_model=ContactResponse,
             status_code=status.HTTP_201_CREATED)
def send_contact_request(request: ContactRequest, db: Session = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    try:
        return contact_crud.send_request(db, current_user.id, request.addressee_id)
    except contact_crud.ContactError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.patch("/contacts/requests/{request_id}", response_model=ContactResponse | None)
def answer_contact_request(request_id: int, answer: ContactAnswer,
                           db: Session = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    try:
        return contact_crud.answer_request(db, request_id, current_user.id, answer.action)
    except contact_crud.ContactError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(contact_id: int, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    try:
        contact_crud.remove_contact(db, contact_id, current_user.id)
    except contact_crud.ContactError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/block", response_model=BlockResponse)
def block_user(user_id: int, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    try:
        return contact_crud.block_user(db, current_user.id, user_id)
    except contact_crud.ContactError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.delete("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
def unblock_user(user_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    try:
        contact_crud.unblock_user(db, current_user.id, user_id)
    except contact_crud.ContactError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)