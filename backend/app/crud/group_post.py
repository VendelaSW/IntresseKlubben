from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.profanity import censor_text
from app.crud.contact import blocked_user_ids
from app.crud.group import get_membership
from app.models.group import Group, GroupRole
from app.models.group_post import GroupPost


def create_group_post(db: Session, group_id: int, author_id: int, content: str) -> GroupPost:
    post = GroupPost(group_id=group_id, author_id=author_id, content=censor_text(content))
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def get_group_posts(db: Session, group_id: int, viewer_id: int) -> list[GroupPost]:
    """Klubbens inlägg: det fastnålade först, sedan nyaste först. Utan dem från användare som är
    blockerade åt något håll (som chatten, se get_group_messages)."""
    query = db.query(GroupPost).filter(GroupPost.group_id == group_id)
    hidden = blocked_user_ids(db, viewer_id)
    if hidden:
        query = query.filter(GroupPost.author_id.not_in(hidden))
    # is_(None) är falskt för det fastnålade, som då sorteras först. id som tiebreak, se
    # get_conversation i crud/message.py.
    return query.order_by(GroupPost.pinned_at.is_(None), GroupPost.created_at.desc(), GroupPost.id.desc()).all()


def get_group_post(db: Session, group_id: int, post_id: int) -> GroupPost | None:
    """Inlägget, om det finns i just den här klubben."""
    return db.query(GroupPost).filter(GroupPost.id == post_id, GroupPost.group_id == group_id).first()


def is_group_owner(group: Group, user_id: int) -> bool:
    membership = get_membership(group, user_id)
    return membership is not None and membership.role == GroupRole.owner


def can_delete_post(group: Group, post: GroupPost, user_id: int) -> bool:
    """Den som skrev inlägget, och klubbens ägare och administratörer (SCRUM-160), får radera det. Ett
    fastnålat inlägg får bara ägaren radera."""
    if is_group_owner(group, user_id):
        return True
    if post.pinned_at is not None:
        return False
    membership = get_membership(group, user_id)
    return post.author_id == user_id or (membership is not None and membership.role == GroupRole.admin)


def pin_group_post(db: Session, post: GroupPost) -> GroupPost:
    """Nålar fast inlägget. Bara ett i taget, så ett annat fastnålat i klubben tas loss."""
    db.query(GroupPost).filter(
        GroupPost.group_id == post.group_id, GroupPost.id != post.id, GroupPost.pinned_at.is_not(None)
    ).update({GroupPost.pinned_at: None}, synchronize_session=False)
    if post.pinned_at is None:
        post.pinned_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(post)
    return post


def unpin_group_post(db: Session, post: GroupPost) -> GroupPost:
    post.pinned_at = None
    db.commit()
    db.refresh(post)
    return post


def delete_group_post(db: Session, post: GroupPost) -> None:
    db.delete(post)
    db.commit()
