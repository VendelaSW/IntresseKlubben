"""
Anmälningar (se models/report.py). Granskningen görs i SCRUM-131.

Man kan anmäla en användare, ett brev man har fått, och ett meddelande eller en
lapp i en klubb man är med i. Aldrig sig själv eller något man själv har skrivit.
"""

from sqlalchemy.orm import Session

from app.core import error_messages as msg
from app.crud.group import get_group, get_membership
from app.models.group_message import GroupMessage
from app.models.group_post import GroupPost
from app.models.message import Message
from app.models.report import Report, ReportTarget
from app.models.user import User
from app.schemas.report import ReportCreate


class ReportError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def _in_group(db: Session, group_id: int, user_id: int) -> bool:
    group = get_group(db, group_id)
    return group is not None and get_membership(group, user_id) is not None


def _target(db: Session, reporter_id: int, data: ReportCreate) -> tuple[int, str | None]:
    """Den anmälda användaren och en kopia av det anmälda (None för en profil).
    404 om det inte finns eller om den som anmäler inte får se det."""
    if data.target_type == ReportTarget.profile:
        user = db.get(User, data.target_id)
        if user is None:
            raise ReportError(404, msg.REPORT_TARGET_NOT_FOUND)
        return user.id, None
    if data.target_type == ReportTarget.message:
        message = db.get(Message, data.target_id)
        # Bara brev man själv har fått.
        if message is None or message.recipient_id != reporter_id:
            raise ReportError(404, msg.REPORT_TARGET_NOT_FOUND)
        return message.sender_id, message.text
    if data.target_type == ReportTarget.group_message:
        message = db.get(GroupMessage, data.target_id)
        if message is None or not _in_group(db, message.group_id, reporter_id):
            raise ReportError(404, msg.REPORT_TARGET_NOT_FOUND)
        return message.sender_id, message.content
    post = db.get(GroupPost, data.target_id)
    if post is None or not _in_group(db, post.group_id, reporter_id):
        raise ReportError(404, msg.REPORT_TARGET_NOT_FOUND)
    return post.author_id, post.content


def create_report(db: Session, reporter_id: int, data: ReportCreate) -> Report:
    reported_user_id, content = _target(db, reporter_id, data)
    if reported_user_id == reporter_id:
        raise ReportError(400, msg.REPORT_SELF)
    report = Report(
        reporter_id=reporter_id,
        reported_user_id=reported_user_id,
        target_type=data.target_type.value,
        target_id=None if data.target_type == ReportTarget.profile else data.target_id,
        content=content,
        reason=data.reason.value,
        comment=data.comment,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def anonymize_user_reports(db: Session, user_id: int) -> None:
    """Ett raderat kontos anmälningar finns kvar för granskning, men utan koppling
    till kontot. Sparar inte (se delete_user)."""
    db.query(Report).filter(Report.reporter_id == user_id).update(
        {Report.reporter_id: None}, synchronize_session=False
    )
    db.query(Report).filter(Report.reported_user_id == user_id).update(
        {Report.reported_user_id: None}, synchronize_session=False
    )
