"""
Notiser från Intresseklubben (se crud/notification.py för hur de skickas).

GET /notifications - den inloggades notiser, nyaste först (högst LIST_LIMIT),
t.ex. att ett event man skulle gå på har ställts in eller fått ny tid. Olästa
räknas i GET /users/me/badges.

POST /notifications/{id}/read - markerar en notis som läst (när man öppnar den,
som ett brev). 404 om den inte finns eller är någon annans.

POST /notifications/read - markerar alla notiser som lästa ("Markera alla som
lästa").

DELETE /notifications/{id} - tar bort en notis. 404 om den inte finns eller är
någon annans.

DELETE /notifications - tar bort alla ens notiser.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_profile
from app.core import error_messages as msg
from app.crud.notification import (
    delete_all_notifications,
    delete_notification,
    list_notifications,
    mark_all_read,
    mark_read,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.notification import NotificationOut

# Låst tills profilen är klar (se require_profile).
router = APIRouter(prefix="/notifications", tags=["notifications"], dependencies=[Depends(require_profile)])


@router.get("", response_model=list[NotificationOut])
def read_my_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_notifications(db, current_user.id)


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_my_notifications_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    mark_all_read(db, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_my_notification_read(
    notification_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    if not mark_read(db, current_user.id, notification_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg.NOTIFICATION_NOT_FOUND)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    delete_all_notifications(db, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_notification(
    notification_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    if not delete_notification(db, current_user.id, notification_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg.NOTIFICATION_NOT_FOUND)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
