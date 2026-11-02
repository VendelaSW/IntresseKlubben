"""
Notiser från Intresseklubben (se models/notification.py).

notify() är det allmänna sättet att skicka en notis till en eller flera
användare. Under den finns de färdiga notiserna, t.ex. att ett event ställs in
eller får ny tid eller plats: de går till dem som har svarat Ja eller Kanske,
utom skaparen själv och den som är blockerad åt något håll med skaparen (de ser
inte eventet).
"""

from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.crud.contact import blocked_user_ids
from app.models.email_token import utc_now
from app.models.event import Event, EventAnswer, EventResponse
from app.models.notification import Notification, NotificationKind

# Så många notiser visas, nyaste först. Äldre finns kvar men visas inte.
LIST_LIMIT = 50


def notify(
    db: Session,
    user_ids: Iterable[int],
    kind: NotificationKind,
    title: str,
    body: str | None = None,
    quote: str | None = None,
    quote_by: str | None = None,
    link: str | None = None,
) -> None:
    """Lägger en notis till var och en av `user_ids`. Sparar inte: den som anropar sparar, så att notisen och det
    den handlar om sparas på en gång."""
    for user_id in set(user_ids):
        db.add(
            Notification(
                user_id=user_id,
                kind=kind.value,
                title=title,
                body=body,
                quote=quote,
                quote_by=quote_by,
                link=link,
            )
        )


# ---------- Events ----------


def _attendee_ids(db: Session, event: Event) -> list[int]:
    """De som har svarat Ja eller Kanske på eventet, utom skaparen och den som är blockerad åt något håll."""
    hidden = blocked_user_ids(db, event.created_by)
    rows = db.query(EventResponse.user_id).filter(
        EventResponse.event_id == event.id,
        EventResponse.answer.in_([EventAnswer.yes, EventAnswer.maybe]),
        EventResponse.user_id != event.created_by,
    )
    return [user_id for (user_id,) in rows if user_id not in hidden]


def _user_name(user) -> str:
    return (user.profile.name if user.profile else None) or user.username


def _creator_name(event: Event) -> str:
    return _user_name(event.creator)


def notify_event_cancelled(db: Session, event: Event, message: str | None, by) -> None:
    """Notiser om att eventet ställs in, med meddelandet från `by`, den som tar bort det. Görs innan eventet raderas
    (svaren behövs). Sparar inte: raderingen sparar allt på en gång. Ingen länk, eftersom eventet inte finns kvar.
    Tar klubbens ägare bort någon annans event (SCRUM-326) får också skaparen veta det, men ägaren får ingen själv."""
    name = _user_name(by)
    notify(
        db,
        [user_id for user_id in _attendee_ids(db, event) if user_id != by.id],
        NotificationKind.event_cancelled,
        title=f"«{event.title}» har ställts in",
        body=f"{name} har tagit bort eventet som du skulle gå på.",
        quote=message,
        quote_by=name if message else None,
    )
    if by.id != event.created_by:
        notify(
            db,
            [event.created_by],
            NotificationKind.event_cancelled,
            title=f"«{event.title}» har tagits bort",
            body=f"{name}, som äger klubben, har tagit bort ditt event.",
            quote=message,
            quote_by=name if message else None,
        )


def notify_event_changed(db: Session, event: Event, time_changed: bool, place_changed: bool, by=None) -> None:
    """Notiser om att eventet har fått ny tid och/eller plats, med en länk till eventet. Sparar. `by` är den som
    ändrade (skaparen eller en medarrangör, SCRUM-296): hen nämns i notisen och får ingen själv."""
    if not (time_changed or place_changed):
        return
    what = "ny tid och plats" if time_changed and place_changed else "ny tid" if time_changed else "ny plats"
    if by is None:
        name = _creator_name(event)
    else:
        name = (by.profile.name if by.profile else None) or by.username
    notify(
        db,
        [user_id for user_id in _attendee_ids(db, event) if by is None or user_id != by.id],
        NotificationKind.event_changed,
        title=f"«{event.title}» har fått {what}",
        body=f"{name} har ändrat eventet som du ska gå på.",
        link=f"/events?event={event.id}",
    )
    db.commit()


# ---------- Läsa och ta bort ----------


def list_notifications(db: Session, user_id: int) -> list[Notification]:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(LIST_LIMIT)
        .all()
    )


def unread_count(user_id: int):
    """Antal olästa notiser bland dem som visas (de LIST_LIMIT senaste), så att märket aldrig räknar en notis som
    inte syns i listan. En fråga att ställa ihop med märkenas andra räkningar (se routes/badges.py)."""
    shown = (
        select(Notification.read_at)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(LIST_LIMIT)
        .subquery()
    )
    return select(func.count()).select_from(shown).where(shown.c.read_at.is_(None))


def mark_read(db: Session, user_id: int, notification_id: int) -> bool:
    """Markerar en av användarens notiser som läst (när man öppnar den). Går att upprepa. False om den inte finns
    eller är någon annans."""
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .one_or_none()
    )
    if notification is None:
        return False
    if notification.read_at is None:
        notification.read_at = utc_now()
        db.commit()
    return True


def mark_all_read(db: Session, user_id: int) -> None:
    db.query(Notification).filter(Notification.user_id == user_id, Notification.read_at.is_(None)).update(
        {Notification.read_at: utc_now()}, synchronize_session=False
    )
    db.commit()


def delete_notification(db: Session, user_id: int, notification_id: int) -> bool:
    """Tar bort en av användarens notiser. False om den inte finns eller är någon annans."""
    deleted = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted > 0


def delete_all_notifications(db: Session, user_id: int) -> None:
    db.query(Notification).filter(Notification.user_id == user_id).delete(synchronize_session=False)
    db.commit()


def delete_user_notifications(db: Session, user_id: int) -> None:
    """Tar bort ett raderat kontos notiser. Sparar inte."""
    db.query(Notification).filter(Notification.user_id == user_id).delete(synchronize_session=False)
