import enum

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core import error_messages as msg
from app.crud.contact import accepted_contact_ids, blocked_user_ids
from app.models.group import Group, GroupInvitation, GroupMember, GroupRole, GroupVisibility
from app.models.user import User
from app.schemas.group import GroupCreate

# Hur många grupper en användare får vara med i (även de man äger).
MAX_MEMBERSHIPS = 20


class GroupRuleError(Exception):
    """En regel för grupper bröts, t.ex. ett upptaget namn. Meddelandet visas för användaren."""

    status_code = 409


class NotAContactError(GroupRuleError):
    """Någon som inte är en kontakt försökte bjudas in."""

    status_code = 422


class GroupSort(str, enum.Enum):
    """Sorteringar för listan över öppna grupper (GET /groups/)."""

    name = "name"  # A-Ö, standard
    members = "members"  # flest medlemmar först
    newest = "newest"  # senast skapad först


def _base_query(db: Session):
    # Laddar medlemmarna i samma veva, så att antal och roller inte ger en fråga per grupp.
    return db.query(Group).options(
        selectinload(Group.members),
        selectinload(Group.invitations),
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
    hidden = blocked_user_ids(db, viewer_id)
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


def _escape_like(text: str) -> str:
    # % och _ är jokertecken i LIKE. Här ska de betyda sig själva.
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_public_groups(
    db: Session,
    interest_id: int | None = None,
    municipality_code: str | None = None,
    q: str | None = None,
    sort: GroupSort = GroupSort.name,
    reverse: bool = False,
    limit: int | None = None,
    offset: int = 0,
    exclude_member_id: int | None = None,
    hidden_user_ids: set[int] | None = None,
) -> list[Group]:
    """Öppna grupper, valfritt filtrerade, sökta, sorterade och en sida i taget.

    q söker i namn och beskrivning, utan hänsyn till versaler. reverse vänder
    sorteringen (Ö-A, färst medlemmar först, äldst först).
    exclude_member_id tar bort grupper den användaren redan är med i.
    hidden_user_ids (blockerade åt något håll) räknas inte med när det sorteras
    på medlemmar, så att ordningen stämmer med antalet som visas och inte
    avslöjar någon dold. Varje sortering slutar på id, så att samma grupp
    aldrig hamnar på två sidor eller hoppas över mellan limit/offset-anrop.
    """
    query = _base_query(db).filter(Group.visibility == GroupVisibility.public)
    if interest_id is not None:
        query = query.filter(Group.interest_id == interest_id)
    if municipality_code is not None:
        query = query.filter(Group.municipality_code == municipality_code)
    if q and q.strip():
        pattern = f"%{_escape_like(q.strip())}%"
        query = query.filter(
            or_(Group.name.ilike(pattern, escape="\\"), Group.description.ilike(pattern, escape="\\"))
        )
    if exclude_member_id is not None:
        my_group_ids = select(GroupMember.group_id).where(GroupMember.user_id == exclude_member_id)
        query = query.filter(Group.id.not_in(my_group_ids))

    if sort == GroupSort.members:
        counted = select(func.count(GroupMember.id)).where(GroupMember.group_id == Group.id)
        if hidden_user_ids:
            counted = counted.where(GroupMember.user_id.not_in(hidden_user_ids))
        # Flest först, och vid lika antal i namnordning.
        keys = [(counted.correlate(Group).scalar_subquery(), True), (Group.name, False), (Group.id, False)]
    elif sort == GroupSort.newest:
        keys = [(Group.created_at, True), (Group.id, True)]
    else:
        keys = [(Group.name, False), (Group.id, False)]
    # (kolumn, fallande). reverse vänder alla, även det som avgör vid lika, så
    # att omvänd ordning är exakt den vanliga baklänges.
    query = query.order_by(*(col.desc() if descending != reverse else col.asc() for col, descending in keys))

    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


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
        # Inbjudan har gjort sitt när man har gått med.
        db.query(GroupInvitation).filter(
            GroupInvitation.group_id == group.id, GroupInvitation.user_id == user.id
        ).delete(synchronize_session=False)
        db.commit()
    return get_group(db, group.id)


def remove_member(db: Session, group: Group, user_id: int) -> None:
    """Tar bort användaren ur gruppen, utan att spara. Ägaren ersätts av den som
    varit med längst, och en tom grupp raderas. Delas av leave_group och
    radering av konto (crud/user.py), som sparar allt på en gång."""
    membership = get_membership(group, user_id)
    if membership is None:
        return
    others = [m for m in group.members if m.user_id != user_id]
    if not others:
        db.delete(group)
    else:
        if membership.role == GroupRole.owner:
            others[0].role = GroupRole.owner  # members är sorterad på joined_at
        group.members.remove(membership)


def leave_group(db: Session, group: Group, user: User) -> None:
    """Lämnar gruppen. Ägaren ersätts av den som varit med längst, och en tom grupp raderas."""
    remove_member(db, group, user.id)
    db.commit()


def delete_group(db: Session, group: Group) -> None:
    db.delete(group)
    db.commit()


# ---------- Inbjudningar ----------


def can_invite(group: Group, user_id: int) -> bool:
    """Ägaren får alltid bjuda in, andra medlemmar bara om ägaren har slagit på det."""
    membership = get_membership(group, user_id)
    if membership is None:
        return False
    return membership.role == GroupRole.owner or group.members_can_invite


def is_invited(group: Group, user_id: int) -> bool:
    return any(i.user_id == user_id for i in group.invitations)


def invite_to_group(db: Session, group: Group, inviter_id: int, user_ids: list[int]) -> list[User]:
    """Bjuder in inviter_id:s kontakter (efter id). Att inviter_id får
    bjuda in kontrolleras av den som anropar (can_invite). Antingen går alla
    inbjudningar igenom eller ingen. Redan medlemmar, redan inbjudna och de som
    har en blockering med ägaren hoppas över tyst: ett fel skulle avslöja för
    den som bjuder in att ägaren har en blockering.
    Returnerar de som blev inbjudna den här gången (profil förladdad)."""
    contact_ids = accepted_contact_ids(db, inviter_id)
    target_ids: set[int] = set()
    for user_id in user_ids:
        # Samma svar för en okänd användare och en som inte är en kontakt.
        if user_id not in contact_ids:
            raise NotAContactError(msg.CAN_ONLY_INVITE_CONTACTS)
        target_ids.add(user_id)

    for owner in (m for m in group.members if m.role == GroupRole.owner):
        target_ids -= blocked_user_ids(db, owner.user_id)
    target_ids -= {m.user_id for m in group.members}
    target_ids -= {i.user_id for i in group.invitations}
    db.add_all(
        GroupInvitation(group_id=group.id, user_id=user_id, invited_by=inviter_id) for user_id in target_ids
    )
    db.commit()
    return list(
        db.query(User)
        .options(selectinload(User.profile))
        .filter(User.id.in_(target_ids))
        .order_by(User.id)
        .all()
    )


def list_user_invitations(db: Session, user_id: int) -> list[Group]:
    """Klubbar användaren är inbjuden till (och inte redan med i), nyaste inbjudan först."""
    my_group_ids = select(GroupMember.group_id).where(GroupMember.user_id == user_id)
    return (
        _base_query(db)
        .join(GroupInvitation, GroupInvitation.group_id == Group.id)
        .filter(GroupInvitation.user_id == user_id, Group.id.not_in(my_group_ids))
        .order_by(GroupInvitation.created_at.desc(), GroupInvitation.id.desc())
        .all()
    )


def decline_invitation(db: Session, group: Group, user_id: int) -> None:
    """Avböjer inbjudan (tar bort den). Går att upprepa utan fel."""
    db.query(GroupInvitation).filter(
        GroupInvitation.group_id == group.id, GroupInvitation.user_id == user_id
    ).delete(synchronize_session=False)
    db.commit()
