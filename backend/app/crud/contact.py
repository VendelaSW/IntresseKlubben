from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.contact import Contact
from app.models.user import User


class ContactError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def _pair_key(first_id: int, second_id: int) -> str:
    return f"{min(first_id, second_id)}:{max(first_id, second_id)}"


def _require_other_user(db: Session, actor_id: int, other_id: int) -> None:
    if actor_id == other_id:
        raise ContactError(400, "Cannot create a relationship with yourself")
    if db.get(User, other_id) is None:
        raise ContactError(404, "User not found")


def _save(db: Session, contact: Contact) -> Contact:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ContactError(409, "Relationship changed; please retry") from exc
    db.refresh(contact)
    return contact


def list_contacts(db: Session, user_id: int) -> dict[str, list[tuple[Contact, User]]]:
    """Each item pairs the contact row with the other user (profile preloaded)."""
    # Blocks are excluded so users cannot see who has blocked them.
    rows = (db.query(Contact)
            .filter(or_(Contact.requester_id == user_id, Contact.addressee_id == user_id),
                    Contact.status.in_(("PENDING", "ACCEPTED")))
            .order_by(Contact.id).all())
    other_ids = {c.addressee_id if c.requester_id == user_id else c.requester_id for c in rows}
    users = {u.id: u for u in (db.query(User).options(selectinload(User.profile))
                               .filter(User.id.in_(other_ids)).all())}
    result = {"contacts": [], "incoming_requests": [], "outgoing_requests": []}
    for c in rows:
        if c.status == "ACCEPTED":
            result["contacts"].append((c, users[c.addressee_id if c.requester_id == user_id
                                                 else c.requester_id]))
        elif c.addressee_id == user_id:
            result["incoming_requests"].append((c, users[c.requester_id]))
        else:
            result["outgoing_requests"].append((c, users[c.addressee_id]))
    return result


def send_request(db: Session, requester_id: int, addressee_id: int) -> Contact:
    _require_other_user(db, requester_id, addressee_id)
    key = _pair_key(requester_id, addressee_id)
    existing = db.query(Contact).filter(Contact.pair_key == key).one_or_none()
    if existing is not None:
        raise ContactError(409, "Relationship already exists or a user is blocked")
    contact = Contact(requester_id=requester_id, addressee_id=addressee_id,
                      pair_key=key, status="PENDING")
    db.add(contact)
    return _save(db, contact)


def answer_request(db: Session, request_id: int, addressee_id: int,
                   action: str) -> Contact | None:
    contact = db.query(Contact).filter(Contact.id == request_id).with_for_update().one_or_none()
    if contact is None or contact.status != "PENDING":
        raise ContactError(404, "Pending request not found")
    if contact.addressee_id != addressee_id:
        raise ContactError(403, "Only the addressee can answer this request")
    if action == "reject":
        db.delete(contact)
        db.commit()
        return None
    contact.status = "ACCEPTED"
    return _save(db, contact)


def remove_contact(db: Session, contact_id: int, actor_id: int) -> None:
    contact = db.query(Contact).filter(Contact.id == contact_id).with_for_update().one_or_none()
    if contact is None or contact.status != "ACCEPTED":
        raise ContactError(404, "Contact not found")
    if actor_id not in (contact.requester_id, contact.addressee_id):
        raise ContactError(403, "Only a participant can remove this contact")
    db.delete(contact)
    db.commit()


def block_user(db: Session, blocker_id: int, blocked_id: int) -> Contact:
    _require_other_user(db, blocker_id, blocked_id)
    key = _pair_key(blocker_id, blocked_id)
    contact = db.query(Contact).filter(Contact.pair_key == key).with_for_update().one_or_none()
    if contact is None:
        contact = Contact(pair_key=key, requester_id=blocker_id,
                          addressee_id=blocked_id, status="BLOCKED")
        db.add(contact)
    elif contact.status == "BLOCKED" and contact.requester_id != blocker_id:
        raise ContactError(409, "This user has already blocked you")
    else:
        contact.requester_id = blocker_id
        contact.addressee_id = blocked_id
        contact.status = "BLOCKED"
    return _save(db, contact)


def is_blocked(db: Session, user_a_id: int, user_b_id: int) -> bool:
    """True om någon av de två har blockerat den andra, oavsett riktning."""
    key = _pair_key(user_a_id, user_b_id)
    contact = db.query(Contact).filter(Contact.pair_key == key).one_or_none()
    return contact is not None and contact.status == "BLOCKED"


def unblock_user(db: Session, blocker_id: int, blocked_id: int) -> None:
    contact = (db.query(Contact)
               .filter(Contact.pair_key == _pair_key(blocker_id, blocked_id))
               .with_for_update().one_or_none())
    if contact is None or contact.status != "BLOCKED" or contact.requester_id != blocker_id:
        raise ContactError(404, "Block not found")
    db.delete(contact)
    db.commit()