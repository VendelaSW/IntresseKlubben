from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.contact import Contact
from app.models.group import Group, GroupMember, GroupRole, GroupVisibility
from app.models.user import User
from app.schemas.group import GroupCreate

# Hur många grupper en användare får vara med i (även de man äger).
MAX_MEMBERSHIPS = 20


class GroupRuleError(Exception):
    """En regel för grupper bröts, t.ex. ett upptaget namn. Meddelandet visas för användaren."""


def _base_query(db: Session):
    # Laddar medlemmarna i samma veva, så att antal och roller inte ger en fråga per grupp.
    return db.query(Group).options(
        selectinload(Group.members),
        selectinload(Group.interest),
        selectinload(Group.municipality),
    )


def get_group(db: Session, group_id: int) -> Group | None:
    return _base_query(db).filter(Group.id == group_id).first()


def get_membership(group: Group, user_id: int) -> GroupMember | None:
    return next((m for m in group.members if m.user_id == user_id), None)


def list_members(db: Session, group: Group, viewer_id: int) -> list[tuple[GroupMember, User]]:
    """Medlemmarna med sina användare (profil förladdad), längst med först.

    Den som har blockerat tittaren, eller som tittaren har blockerat, visas
    inte - samma regel som i resten av appen.
    """
    blocks = (db.query(Contact)
              .filter(Contact.status == "BLOCKED",
                      or_(Contact.requester_id == viewer_id, Contact.addressee_id == viewer_id))
              .all())
    hidden = {c.addressee_id if c.requester_id == viewer_id else c.requester_id for c in blocks}
    member_ids = [m.user_id for m in group.members if m.user_id not in hidden]
    users = {u.id: u for u in (db.query(User).options(selectinload(User.profile))
                               .filter(User.id.in_(member_ids)).all())}
    return [(m, users[m.user_id]) for m in group.members if m.user_id in users]


def _check_can_join(db: Session, user_id: int) -> None:
    count = db.query(func.count(GroupMember.id)).filter(GroupMember.user_id == user_id).scalar()
    if count >= MAX_MEMBERSHIPS:
        raise GroupRuleError(f"Du kan vara med i max {MAX_MEMBERSHIPS} klubbar")


def _name_taken(db: Session, name: str, municipality_code: str) -> bool:
    return (
        db.query(Group.id)
        .filter(func.lower(Group.name) == name.lower(), Group.municipality_code == municipality_code)
        .first()
        is not None
    )


def create_group(db: Session, user: User, data: GroupCreate) -> Group:
    if _name_taken(db, data.name, data.municipality_code):
        raise GroupRuleError("Det finns redan en klubb med det namnet i kommunen")
    _check_can_join(db, user.id)

    group = Group(**data.model_dump(), created_by=user.id)
    group.members.append(GroupMember(user_id=user.id, role=GroupRole.owner))
    db.add(group)
    try:
        db.commit()
    except IntegrityError:
        # Någon annan hann skapa samma namn mellan kontrollen och sparandet.
        db.rollback()
        raise GroupRuleError("Det finns redan en klubb med det namnet i kommunen")
    return get_group(db, group.id)


def list_public_groups(
    db: Session, interest_id: int | None = None, municipality_code: str | None = None
) -> list[Group]:
    query = _base_query(db).filter(Group.visibility == GroupVisibility.public)
    if interest_id is not None:
        query = query.filter(Group.interest_id == interest_id)
    if municipality_code is not None:
        query = query.filter(Group.municipality_code == municipality_code)
    return query.order_by(Group.name).all()


def list_user_groups(db: Session, user_id: int) -> list[Group]:
    # Även privata grupper, eftersom användaren är med i dem.
    return (
        _base_query(db)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .filter(GroupMember.user_id == user_id)
        .order_by(Group.name)
        .all()
    )


def list_suggested_groups(db: Session, user: User) -> list[Group]:
    """Öppna grupper för användarens intressen som hen inte redan är med i."""
    interest_ids = [i.id for i in user.interests]
    if not interest_ids:
        return []
    my_group_ids = db.query(GroupMember.group_id).filter(GroupMember.user_id == user.id)
    return (
        _base_query(db)
        .filter(
            Group.visibility == GroupVisibility.public,
            Group.interest_id.in_(interest_ids),
            Group.id.not_in(my_group_ids),
        )
        .order_by(Group.name)
        .all()
    )


def join_group(db: Session, group: Group, user: User) -> Group:
    # Redan med → inget att göra, så anropet kan upprepas utan fel.
    if get_membership(group, user.id) is None:
        _check_can_join(db, user.id)
        group.members.append(GroupMember(user_id=user.id, role=GroupRole.member))
        db.commit()
    return get_group(db, group.id)


def leave_group(db: Session, group: Group, user: User) -> None:
    """Lämnar gruppen. Ägaren ersätts av den som varit med längst, och en tom grupp raderas."""
    membership = get_membership(group, user.id)
    if membership is None:
        return
    others = [m for m in group.members if m.user_id != user.id]
    if not others:
        db.delete(group)
    else:
        if membership.role == GroupRole.owner:
            others[0].role = GroupRole.owner  # members är sorterad på joined_at
        group.members.remove(membership)
    db.commit()


def delete_group(db: Session, group: Group) -> None:
    db.delete(group)
    db.commit()
