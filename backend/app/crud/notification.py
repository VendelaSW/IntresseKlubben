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
from sqlalchemy.orm import Session, joinedload

from app.crud.contact import blocked_user_ids
from app.models.email_token import utc_now
from app.models.event import Event, EventAnswer, EventResponse
from app.models.notification import Notification, NotificationKind
from app.models.user import User

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
    actor_id: int | None = None,
) -> None:
    """Lägger en notis till var och en av `user_ids`. `actor_id` är personen den gäller (t.ex. den som ansökte), vars
    profilbild visas på Notiser. Sparar inte: den som anropar sparar, så att notisen och det den handlar om sparas
    på en gång."""
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
                actor_id=actor_id,
            )
        )


def mark_request_answered(db: Session, kind: NotificationKind, link: str, applicant_id: int) -> None:
    """En ansökan har besvarats eller tagits tillbaka: notiserna om den (`kind` och `link` för eventet eller
    klubben, från den som ansökte) räknas som lästa hos alla som fick dem, så att ingen ser något som redan är
    klart som nytt. Sparar inte."""
    db.query(Notification).filter(
        Notification.kind == kind.value,
        Notification.link == link,
        Notification.actor_id == applicant_id,
        Notification.read_at.is_(None),
    ).update({Notification.read_at: utc_now()}, synchronize_session=False)


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


def _creator_name(event: Event) -> str:
    creator = event.creator
    return (creator.profile.name if creator.profile else None) or creator.username


def notify_event_cancelled(db: Session, event: Event, message: str | None) -> None:
    """Notiser om att eventet ställs in, med skaparens meddelande. Görs innan eventet raderas (svaren behövs).
    Sparar inte: raderingen sparar allt på en gång. Ingen länk, eftersom eventet inte finns kvar."""
    creator = _creator_name(event)
    notify(
        db,
        _attendee_ids(db, event),
        NotificationKind.event_cancelled,
        title=f"Eventet ”{event.title}” har ställts in",
        body=f"{creator} har tagit bort eventet som du skulle gå på.",
        quote=message,
        quote_by=creator if message else None,
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
        title=f"Eventet ”{event.title}” har fått {what}",
        body=f"{name} har ändrat eventet som du ska gå på.",
        link=f"/events?event={event.id}",
    )
    db.commit()


# ---------- Läsa och ta bort ----------


def _actor(actor: User | None, hidden: set[int]) -> dict | None:
    """Personen en notis gäller, som andra användare visas (id, namn och profilbild). None om det inte finns någon,
    om kontot har raderats, eller om någon av dem har blockerat den andra: då syns bara bilden för notisens sort,
    så att blockeringen inte avslöjas."""
    if actor is None or actor.id in hidden:
        return None
    profile = actor.profile
    return {
        "id": actor.id,
        "name": (profile.name if profile else None) or actor.username,
        "profile_image_url": profile.profile_image_url if profile else None,
    }


def list_notifications(db: Session, user_id: int) -> list[dict]:
    """Användarens notiser, nyaste först (högst LIST_LIMIT), med personen de gäller (se _actor)."""
    hidden = blocked_user_ids(db, user_id)
    notifications = (
        db.query(Notification)
        .options(joinedload(Notification.actor).joinedload(User.profile))
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(LIST_LIMIT)
        .all()
    )
    return [
        {
            "id": n.id,
            "kind": n.kind,
            "title": n.title,
            "body": n.body,
            "quote": n.quote,
            "quote_by": n.quote_by,
            "link": n.link,
            "created_at": n.created_at,
            "read": n.read,
            "actor": _actor(n.actor, hidden),
        }
        for n in notifications
    ]


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
    """Tar bort ett raderat kontos notiser, och kontot som person i andras notiser (de visar då bilden för sin
    sort). Sparar inte."""
    db.query(Notification).filter(Notification.user_id == user_id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.actor_id == user_id).update(
        {Notification.actor_id: None}, synchronize_session=False
    )
