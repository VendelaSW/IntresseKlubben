"""
Moderering (SCRUM-131). Bara för moderatorer (se require_moderator), andra får 403.

GET /moderation/reports?handled=false - nya anmälningar (handled=true: hanterade),
nyaste först, med det moderatorn behöver om den anmälda: hur många gånger hen har
anmälts och om hen är eller har varit avstängd.

POST /moderation/reports/{id}/handled - markerar anmälan som hanterad.
DELETE /moderation/reports/{id}/handled - flyttar tillbaka den till de nya.

POST /moderation/reports/{id}/warning - varnar den anmälda (SCRUM-268): personen får en
notis om vilken regel som bröts, med moderatorns valfria meddelande, och anmälan markeras
som hanterad. En anmälan ger högst en varning. Varningarna syns i historiken bredvid
avstängningarna.

PUT /moderation/users/{id}/suspension - stänger av användaren i 1, 7 eller 30
dagar, eller tills vidare (days: null). En avstängning som redan gäller ersätts.
DELETE /moderation/users/{id}/suspension - häver avstängningen.

En avstängd användare kan inte logga in och loggas ut vid nästa anrop (se
auth/security.py), och syns inte under Personer.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_moderator, require_profile
from app.core import error_messages as msg
from app.crud.moderation import (
    has_warning,
    is_active,
    lift_suspension,
    list_reports,
    report_counts,
    set_handled,
    suspend_user,
    suspension_history,
    warn_user,
    warning_history,
)
from app.db.session import get_db
from app.models.group import Group
from app.models.group_message import GroupMessage
from app.models.group_post import GroupPost
from app.models.report import Report, ReportTarget
from app.models.user import User
from app.schemas.moderation import (
    ModerationReportOut,
    PersonRef,
    ReportedUser,
    SuspendIn,
    SuspensionOut,
    WarningOut,
    WarnIn,
)

router = APIRouter(
    prefix="/moderation",
    tags=["moderation"],
    dependencies=[Depends(require_profile), Depends(require_moderator)],
)


def _name(user: User) -> str:
    return (user.profile.name if user.profile else None) or user.username


def _suspension_out(suspension) -> SuspensionOut:
    return SuspensionOut(
        starts_at=suspension.starts_at, until=suspension.until, reason=suspension.reason, lifted_at=suspension.lifted_at
    )


def _warning_out(warning) -> WarningOut:
    return WarningOut(
        report_id=warning.report_id, created_at=warning.created_at, reason=warning.reason, message=warning.message
    )


def _group_name(db: Session, report: Report) -> str | None:
    model = {ReportTarget.group_message.value: GroupMessage, ReportTarget.group_post.value: GroupPost}.get(
        report.target_type
    )
    item = db.get(model, report.target_id) if model and report.target_id else None
    group = db.get(Group, item.group_id) if item else None
    return group.name if group else None


@router.get("/reports", response_model=list[ModerationReportOut])
def read_reports(handled: bool = Query(False), db: Session = Depends(get_db)):
    reports = list_reports(db, handled)
    reported_ids = {r.reported_user_id for r in reports if r.reported_user_id is not None}
    history = suspension_history(db, reported_ids)
    warnings = warning_history(db, reported_ids)
    counts = report_counts(db, reported_ids)
    out = []
    for report in reports:
        reported = None
        if report.reported_user_id is not None:
            user = db.get(User, report.reported_user_id)
            suspensions = history[user.id]
            current = next((s for s in suspensions if is_active(s)), None)
            reported = ReportedUser(
                id=user.id,
                name=_name(user),
                report_count=counts.get(user.id, 0),
                suspension=_suspension_out(current) if current else None,
                previous_suspensions=[_suspension_out(s) for s in suspensions if s is not current],
                warnings=[_warning_out(w) for w in warnings[user.id]],
            )
        reporter = db.get(User, report.reporter_id) if report.reporter_id is not None else None
        moderator = db.get(User, report.handled_by) if report.handled_by is not None else None
        out.append(
            ModerationReportOut(
                id=report.id,
                target_type=report.target_type,
                target_id=report.target_id,
                group_name=_group_name(db, report),
                content=report.content,
                reason=report.reason,
                comment=report.comment,
                created_at=report.created_at,
                handled_at=report.handled_at,
                handled_by=_name(moderator) if moderator else None,
                reported=reported,
                reporter=PersonRef(id=reporter.id, name=_name(reporter)) if reporter else None,
            )
        )
    return out


def _report_or_404(db: Session, report_id: int) -> Report:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg.REPORT_NOT_FOUND)
    return report


@router.post("/reports/{report_id}/handled", status_code=status.HTTP_204_NO_CONTENT)
def mark_handled(report_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    set_handled(db, _report_or_404(db, report_id), current_user.id, handled=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/reports/{report_id}/handled", status_code=status.HTTP_204_NO_CONTENT)
def mark_new(report_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    set_handled(db, _report_or_404(db, report_id), current_user.id, handled=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reports/{report_id}/warning", response_model=WarningOut, status_code=status.HTTP_201_CREATED)
def warn(report_id: int, data: WarnIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = _report_or_404(db, report_id)
    if report.reported_user_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg.WARNING_NO_PERSON)
    if report.reported_user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg.CANNOT_WARN_SELF)
    if has_warning(db, report.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg.WARNING_ALREADY_GIVEN)
    return _warning_out(warn_user(db, report, data.reason.value, data.message, current_user.id))


def _user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg.USER_NOT_FOUND)
    return user


@router.put("/users/{user_id}/suspension", response_model=SuspensionOut)
def suspend(
    user_id: int, data: SuspendIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    user = _user_or_404(db, user_id)
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg.CANNOT_SUSPEND_SELF)
    return _suspension_out(suspend_user(db, user.id, data.days, data.reason.value, current_user.id))


@router.delete("/users/{user_id}/suspension", status_code=status.HTTP_204_NO_CONTENT)
def lift(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lift_suspension(db, _user_or_404(db, user_id).id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
