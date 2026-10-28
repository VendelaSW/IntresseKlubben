import enum

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core import error_messages as msg
from app.crud.contact import accepted_contact_ids, blocked_user_ids
from app.crud.notification import notify
from app.models.group import Group, GroupInvitation, GroupJoinRequest, GroupMember, GroupRole, GroupVisibility
from app.models.notification import NotificationKind
from app.models.user import User
from app.schemas.group import GroupCreate
from app.services.regions import areas_of_kommun

# Klubbar som syns i listor och går att hitta: öppna och de man ansöker till. Privata syns bara för
# medlemmar och inbjudna.
LISTED = (GroupVisibility.public, GroupVisibility.application)

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
        selectinload(Group.join_requests),
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


def _check_can_join(db: Session, user_id: int, message: str | None = None) -> None:
    count = db.query(func.count(GroupMember.id)).filter(GroupMember.user_id == user_id).scalar()
    if count >= MAX_MEMBERSHIPS:
        raise GroupRuleError(message or f"Du kan vara med i max {MAX_MEMBERSHIPS} klubbar")


def is_full(group: Group) -> bool:
    """Har klubben nått sitt max antal medlemmar (SCRUM-216)? Alla medlemmar räknas, även dolda."""
    return group.max_members is not None and len(group.members) >= group.max_members


def _name_taken(db: Session, name: str, scope: str, scope_code: str) -> bool:
    return (
        db.query(Group.id)
        .filter(func.lower(Group.name) == name.lower(), Group.scope == scope, Group.scope_code == scope_code)
        .first()
        is not None
    )


def create_group(db: Session, user: User, data: GroupCreate) -> Group:
    if _name_taken(db, data.name, data.scope.value, data.scope_code):
        raise GroupRuleError(msg.GROUP_NAME_TAKEN)
    _check_can_join(db, user.id)

    # mode="json": räckvidd och nivå sparas som text (se Group.scope).
    group = Group(**data.model_dump(mode="json"), created_by=user.id)
    group.members.append(GroupMember(user_id=user.id, role=GroupRole.owner))
    db.add(group)
    try:
        db.commit()
    except IntegrityError:
        # Någon annan hann skapa samma namn mellan kontrollen och sparandet.
        db.rollback()
        raise GroupRuleError(msg.GROUP_NAME_TAKEN)
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
    query = _base_query(db).filter(Group.visibility.in_(LISTED))
    if interest_id is not None:
        query = query.filter(Group.interest_id == interest_id)
    if municipality_code is not None:
        query = query.filter(applies_to_kommun(municipality_code))
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


def applies_to_kommun(kommun_code: str):
    """Villkoret att en klubb gäller kommunen: klubben finns i kommunen, eller gäller ett större område som
    kommunen ligger i (länet, landskapet, landsdelen eller hela Sverige, SCRUM-282)."""
    return or_(*(and_(Group.scope == scope, Group.scope_code == code) for scope, code in areas_of_kommun(kommun_code)))


def list_user_groups(db: Session, user_id: int) -> list[Group]:
    # Även privata grupper, eftersom användaren är med i dem.
    return (
        _base_query(db)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .filter(GroupMember.user_id == user_id)
        .order_by(Group.name)
        .all()
    )


def list_member_groups_visible_to(db: Session, member_id: int, viewer_id: int) -> list[Group]:
    """Klubbarna `member_id` är med i, som `viewer_id` får se: alla öppna, och
    privata bara om `viewer_id` också är med i dem (för en persons profil)."""
    viewer_groups = select(GroupMember.group_id).where(GroupMember.user_id == viewer_id)
    return (
        _base_query(db)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .filter(
            GroupMember.user_id == member_id,
            or_(Group.visibility.in_(LISTED), Group.id.in_(viewer_groups)),
        )
        .order_by(Group.name)
        .all()
    )


def list_suggested_groups(db: Session, user: User) -> list[Group]:
    """Öppna grupper (och de man ansöker till) för användarens intressen som hen inte redan är med i."""
    interest_ids = [i.id for i in user.interests]
    if not interest_ids:
        return []
    my_group_ids = db.query(GroupMember.group_id).filter(GroupMember.user_id == user.id)
    return (
        _base_query(db)
        .filter(
            Group.visibility.in_(LISTED),
            Group.interest_id.in_(interest_ids),
            Group.id.not_in(my_group_ids),
        )
        .order_by(Group.name)
        .all()
    )


def join_group(db: Session, group: Group, user: User) -> Group:
    """Går med i klubben. En klubb man ansöker till går bara att gå med i direkt med en inbjudan (annars
    ansöker man, se apply_to_group), och en full klubb inte alls."""
    # Redan med → inget att göra, så anropet kan upprepas utan fel.
    if get_membership(group, user.id) is None:
        if group.visibility == GroupVisibility.application and not is_invited(group, user.id):
            raise GroupRuleError(msg.GROUP_MUST_APPLY)
        if is_full(group):
            raise GroupRuleError(msg.GROUP_FULL)
        _check_can_join(db, user.id)
        _add_member(db, group, user.id)
        db.commit()
    return get_group(db, group.id)


def _add_member(db: Session, group: Group, user_id: int) -> None:
    """Gör användaren till medlem, utan att spara. Inbjudan och ansökan har gjort sitt."""
    group.members.append(GroupMember(user_id=user_id, role=GroupRole.member))
    for model in (GroupInvitation, GroupJoinRequest):
        db.query(model).filter(model.group_id == group.id, model.user_id == user_id).delete(synchronize_session=False)


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
            # Den administratör som varit med längst, annars den medlem som varit med längst (members är
            # sorterad på joined_at).
            successor = next((m for m in others if m.role == GroupRole.admin), others[0])
            successor.role = GroupRole.owner
        group.members.remove(membership)


def leave_group(db: Session, group: Group, user: User) -> None:
    """Lämnar gruppen. Ägaren ersätts av den som varit med längst, och en tom grupp raderas."""
    remove_member(db, group, user.id)
    db.commit()


def delete_group(db: Session, group: Group) -> None:
    db.delete(group)
    db.commit()


# ---------- Inbjudningar ----------


def is_moderator(group: Group, user_id: int) -> bool:
    """Ägaren eller en administratör (SCRUM-160): får svara på ansökningar, ta bort medlemmar och moderera
    klubbchatten."""
    membership = get_membership(group, user_id)
    return membership is not None and membership.role in (GroupRole.owner, GroupRole.admin)


def can_invite(group: Group, user_id: int) -> bool:
    """Ägaren och administratörer får alltid bjuda in, andra medlemmar bara om ägaren har slagit på det."""
    membership = get_membership(group, user_id)
    if membership is None:
        return False
    return membership.role in (GroupRole.owner, GroupRole.admin) or group.members_can_invite


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


def invitation_count(user_id: int):
    """Frågan efter antalet klubbar i list_user_invitations, att ställa ensam
    eller ihop med andra räkningar i samma anrop till databasen."""
    my_group_ids = select(GroupMember.group_id).where(GroupMember.user_id == user_id)
    return (
        select(func.count())
        .select_from(GroupInvitation)
        .where(GroupInvitation.user_id == user_id, GroupInvitation.group_id.not_in(my_group_ids))
    )


def count_user_invitations(db: Session, user_id: int) -> int:
    """Antalet klubbar i list_user_invitations, utan att hämta klubbarna."""
    return db.scalar(invitation_count(user_id))


def decline_invitation(db: Session, group: Group, user_id: int) -> None:
    """Avböjer inbjudan (tar bort den). Går att upprepa utan fel."""
    db.query(GroupInvitation).filter(
        GroupInvitation.group_id == group.id, GroupInvitation.user_id == user_id
    ).delete(synchronize_session=False)
    db.commit()


# ---------- Ansökningar (SCRUM-159) ----------


def _owner_ids(group: Group) -> list[int]:
    return [m.user_id for m in group.members if m.role == GroupRole.owner]


def has_applied(group: Group, user_id: int) -> bool:
    return any(r.user_id == user_id for r in group.join_requests)


def request_count(db: Session, group: Group, owner_id: int) -> int:
    """Antalet ansökningar som väntar, som ägaren (eller en administratör) ser dem (utan blockerade, se
    list_join_requests)."""
    if not group.join_requests:
        return 0
    hidden = blocked_user_ids(db, owner_id)
    return sum(1 for r in group.join_requests if r.user_id not in hidden)


def _display_name(user: User) -> str:
    return (user.profile.name if user.profile else None) or user.username


def apply_to_group(db: Session, group: Group, user: User, message: str | None) -> None:
    """Ansöker till en klubb man ansöker till. Ägaren får en notis med meddelandet. Går att upprepa: en ny
    ansökan ersätter inte den som väntar. Har ägaren och den sökande en blockering skapas ingen ansökan, utan
    att det märks (ett fel skulle avslöja blockeringen)."""
    if group.visibility != GroupVisibility.application:
        raise GroupRuleError(msg.GROUP_NOT_APPLICATION)
    if get_membership(group, user.id) is not None or has_applied(group, user.id):
        return
    if is_full(group):
        raise GroupRuleError(msg.GROUP_FULL)
    _check_can_join(db, user.id)
    owners = _owner_ids(group)
    hidden = blocked_user_ids(db, user.id)
    if any(owner in hidden for owner in owners):
        return
    db.add(GroupJoinRequest(group_id=group.id, user_id=user.id, message=message))
    name = _display_name(user)
    notify(
        db,
        owners,
        NotificationKind.group_join_request,
        title=f"{name} vill gå med i {group.name}",
        body="Svara på ansökan på klubbens sida.",
        quote=message,
        quote_by=name if message else None,
        link=f"/klubbar?klubb={group.id}",
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # samma ansökan skickades två gånger samtidigt: en räcker


def withdraw_request(db: Session, group: Group, user_id: int) -> None:
    """Tar tillbaka sin ansökan. Går att upprepa utan fel."""
    db.query(GroupJoinRequest).filter(
        GroupJoinRequest.group_id == group.id, GroupJoinRequest.user_id == user_id
    ).delete(synchronize_session=False)
    db.commit()


def list_join_requests(db: Session, group: Group, owner_id: int) -> list[tuple[GroupJoinRequest, User]]:
    """Ansökningarna som väntar, äldst först, med användarna (profil förladdad). Den som har en blockering
    med ägaren visas inte, som i resten av appen."""
    hidden = blocked_user_ids(db, owner_id)
    requests = [r for r in group.join_requests if r.user_id not in hidden]
    users = {
        u.id: u
        for u in db.query(User).options(selectinload(User.profile)).filter(User.id.in_([r.user_id for r in requests]))
    }
    return [(r, users[r.user_id]) for r in requests if r.user_id in users]


def _pending_request(group: Group, user_id: int) -> GroupJoinRequest:
    request = next((r for r in group.join_requests if r.user_id == user_id), None)
    if request is None:
        raise GroupRuleError(msg.GROUP_REQUEST_NOT_FOUND)
    return request


def approve_request(db: Session, group: Group, user_id: int) -> None:
    """Godkänner ansökan: personen blir medlem och får en notis. Går inte om klubben är full eller om personen
    redan är med i så många klubbar som går."""
    _pending_request(group, user_id)
    if is_full(group):
        raise GroupRuleError(msg.GROUP_FULL)
    _check_can_join(db, user_id, msg.GROUP_APPLICANT_TOO_MANY_GROUPS)
    _add_member(db, group, user_id)
    notify(
        db,
        [user_id],
        NotificationKind.group_request_approved,
        title=f"Du är med i {group.name}!",
        body="Din ansökan är godkänd.",
        link=f"/klubbar?klubb={group.id}",
    )
    db.commit()


def decline_request(db: Session, group: Group, user_id: int, owner: User, message: str | None = None) -> None:
    """Nekar ansökan: den tas bort, så att personen kan ansöka igen, och personen får en notis, med ägarens
    förklaring om hen skrev en."""
    db.delete(_pending_request(group, user_id))
    owner_name = _display_name(owner)
    notify(
        db,
        [user_id],
        NotificationKind.group_request_declined,
        title=f"Din ansökan till {group.name} fick nej",
        body="Du kan ansöka igen senare, eller hitta en annan klubb.",
        quote=message,
        quote_by=owner_name if message else None,
        link="/klubbar",
    )
    db.commit()


# ---------- Roller och att ta bort medlemmar (SCRUM-160) ----------


def set_member_role(db: Session, group: Group, user_id: int, role: GroupRole) -> None:
    """Gör en medlem till administratör eller vanlig medlem igen, och säger till personen. Att den som anropar
    är ägaren kontrolleras i routen. Ägarens egen roll går inte att ändra."""
    membership = get_membership(group, user_id)
    if membership is None:
        raise GroupRuleError(msg.GROUP_NOT_A_MEMBER)
    if membership.role == GroupRole.owner or role == GroupRole.owner:
        raise GroupRuleError(msg.GROUP_CANNOT_CHANGE_OWNER)
    if membership.role == role:
        return
    membership.role = role
    notify(
        db,
        [user_id],
        NotificationKind.group_role_changed,
        title=f"Du är administratör i {group.name}" if role == GroupRole.admin else f"Du är inte längre administratör i {group.name}",
        body=(
            "Du kan nu svara på ansökningar, ta bort medlemmar och ta bort meddelanden i klubbchatten."
            if role == GroupRole.admin
            else "Ägaren har ändrat din roll till medlem."
        ),
        link=f"/klubbar?klubb={group.id}",
    )
    db.commit()


def kick_member(db: Session, group: Group, user_id: int, by_id: int) -> None:
    """Tar bort en medlem ur klubben (ägaren eller en administratör, se is_moderator), och säger till personen.
    Ägaren går inte att ta bort, och en administratör kan bara tas bort av ägaren."""
    membership = get_membership(group, user_id)
    if membership is None:
        raise GroupRuleError(msg.GROUP_NOT_A_MEMBER)
    if membership.role == GroupRole.owner:
        raise GroupRuleError(msg.GROUP_CANNOT_REMOVE_OWNER)
    by = get_membership(group, by_id)
    if membership.role == GroupRole.admin and (by is None or by.role != GroupRole.owner):
        raise GroupRuleError(msg.GROUP_ADMIN_CANNOT_REMOVE_ADMIN)
    remove_member(db, group, user_id)
    notify(
        db,
        [user_id],
        NotificationKind.group_member_removed,
        title=f"Du har tagits bort ur {group.name}",
        body="En administratör i klubben har tagit bort dig.",
        link="/klubbar",
    )
    db.commit()
