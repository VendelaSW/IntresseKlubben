"""
Moderering (SCRUM-131): anmälningarna (se crud/report.py), varningar (SCRUM-268) och avstängningar.

Bara moderatorer (User.is_moderator, se require_moderator) kommer åt det här.
En avstängd användare kan inte logga in och loggas ut vid nästa anrop (se
auth/security.py), och syns inte under Personer. Avstängningarna sparas som
historik (models/suspension.py), så att moderatorn ser om någon har varit
avstängd förut. Varningarna (models/moderation_warning.py) är ett mellansteg: personen får en
notis om vilken regel som bröts, och varningen syns i samma historik.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.crud.notification import notify
from app.models.email_token import utc_now
from app.models.moderation_warning import ModerationWarning
from app.models.notification import NotificationKind
from app.models.report import Report, ReportReason
from app.models.suspension import Suspension

# Hur länge en avstängning kan vara, i dagar. None = tills vidare.
SUSPENSION_DAYS = (1, 7, 30, None)


def _aware(moment: datetime | None) -> datetime | None:
    """SQLite sparar tider utan tidszon (alltid i UTC)."""
    if moment is not None and moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment


def is_active(suspension: Suspension, now: datetime | None = None) -> bool:
    now = now or utc_now()
    return suspension.lifted_at is None and (suspension.until is None or _aware(suspension.until) > now)


def active_suspension(db: Session, user_id: int) -> Suspension | None:
    """Den avstängning som gäller just nu för användaren, eller None."""
    rows = db.query(Suspension).filter(Suspension.user_id == user_id, Suspension.lifted_at.is_(None)).all()
    return next((s for s in rows if is_active(s)), None)


def suspended_user_ids(db: Session) -> set[int]:
    """Alla som är avstängda just nu (för att dölja dem under Personer)."""
    rows = db.query(Suspension).filter(Suspension.lifted_at.is_(None)).all()
    return {s.user_id for s in rows if is_active(s)}


def suspension_history(db: Session, user_ids: set[int]) -> dict[int, list[Suspension]]:
    """Alla avstängningar per användare, äldsta först."""
    history: dict[int, list[Suspension]] = {user_id: [] for user_id in user_ids}
    if user_ids:
        rows = db.query(Suspension).filter(Suspension.user_id.in_(user_ids)).order_by(Suspension.starts_at, Suspension.id)
        for suspension in rows:
            history[suspension.user_id].append(suspension)
    return history


def suspend_user(db: Session, user_id: int, days: int | None, reason: str, moderator_id: int) -> Suspension:
    """Stänger av användaren i `days` dagar (None = tills vidare). En avstängning som
    redan gäller hävs först, så att bara den nya gäller."""
    lift_suspension(db, user_id, moderator_id, commit=False)
    now = utc_now()
    suspension = Suspension(
        user_id=user_id,
        starts_at=now,
        until=None if days is None else now + timedelta(days=days),
        reason=reason,
        created_by=moderator_id,
    )
    db.add(suspension)
    db.commit()
    db.refresh(suspension)
    return suspension


def lift_suspension(db: Session, user_id: int, moderator_id: int, commit: bool = True) -> bool:
    """Häver den avstängning som gäller. False om användaren inte var avstängd."""
    current = active_suspension(db, user_id)
    if current is not None:
        current.lifted_at = utc_now()
        current.lifted_by = moderator_id
    if commit:
        db.commit()
    return current is not None


# Regeln som bröts, som den står i varningens notis. Samma ord som anledningarna i anmälan (services/reports.js).
RULE_TEXT = {
    ReportReason.harassment.value: "trakasserier eller hot",
    ReportReason.inappropriate.value: "olämpligt eller sexuellt innehåll",
    ReportReason.spam.value: "spam eller bedrägeri",
    ReportReason.fake_profile.value: "falsk profil",
    ReportReason.other.value: "brott mot Intresseklubbens regler",
}


def warn_user(
    db: Session, report: Report, reason: str, message: str | None, moderator_id: int
) -> ModerationWarning:
    """Varnar den anmälda (SCRUM-268): sparar varningen, skickar en notis om vilken regel som bröts (med
    moderatorns meddelande som citat) och markerar anmälan som hanterad. Allt sparas på en gång."""
    warning = ModerationWarning(
        user_id=report.reported_user_id, reason=reason, message=message, report_id=report.id, created_by=moderator_id
    )
    db.add(warning)
    notify(
        db,
        [report.reported_user_id],
        NotificationKind.moderation_warning,
        title=f"Du har fått en varning: {RULE_TEXT.get(reason, RULE_TEXT[ReportReason.other.value])}",
        body="En moderator har sett något du har gjort som bryter mot reglerna. Fortsätter det kan du bli avstängd.",
        quote=message,
        quote_by="Moderator" if message else None,
    )
    set_handled(db, report, moderator_id, handled=True, commit=False)
    db.commit()
    db.refresh(warning)
    return warning


def has_warning(db: Session, report_id: int) -> bool:
    """Har anmälan redan gett en varning? En anmälan ger högst en, så att personen inte får två notiser för
    samma sak (t.ex. om moderatorn öppnar en hanterad anmälan igen)."""
    return db.query(ModerationWarning.id).filter(ModerationWarning.report_id == report_id).first() is not None


def warning_history(db: Session, user_ids: set[int]) -> dict[int, list[ModerationWarning]]:
    """Alla varningar per användare, äldsta först."""
    history: dict[int, list[ModerationWarning]] = {user_id: [] for user_id in user_ids}
    if user_ids:
        rows = (
            db.query(ModerationWarning)
            .filter(ModerationWarning.user_id.in_(user_ids))
            .order_by(ModerationWarning.created_at, ModerationWarning.id)
        )
        for warning in rows:
            history[warning.user_id].append(warning)
    return history


def list_reports(db: Session, handled: bool) -> list[Report]:
    """Nya (ohanterade) eller hanterade anmälningar, nyaste först."""
    query = db.query(Report).filter(Report.handled_at.is_not(None) if handled else Report.handled_at.is_(None))
    return query.order_by(Report.created_at.desc(), Report.id.desc()).all()


def report_counts(db: Session, user_ids: set[int]) -> dict[int, int]:
    """Hur många gånger varje användare har anmälts, totalt."""
    if not user_ids:
        return {}
    rows = (
        db.query(Report.reported_user_id, func.count(Report.id))
        .filter(Report.reported_user_id.in_(user_ids))
        .group_by(Report.reported_user_id)
    )
    return dict(rows.all())


def set_handled(db: Session, report: Report, moderator_id: int, handled: bool, commit: bool = True) -> Report:
    """Markerar anmälan som hanterad, eller flyttar tillbaka den till de nya."""
    report.handled_at = utc_now() if handled else None
    report.handled_by = moderator_id if handled else None
    report.status = "handled" if handled else "new"
    if commit:
        db.commit()
        db.refresh(report)
    return report


def delete_user_moderation(db: Session, user_id: int) -> None:
    """Ett raderat kontos avstängningar och varningar tas bort, och det kontot står inte
    längre som moderator på andras avstängningar, varningar eller hanterade anmälningar.
    Sparar inte (se delete_user)."""
    db.query(Suspension).filter(Suspension.user_id == user_id).delete(synchronize_session=False)
    db.query(ModerationWarning).filter(ModerationWarning.user_id == user_id).delete(synchronize_session=False)
    db.query(ModerationWarning).filter(ModerationWarning.created_by == user_id).update(
        {ModerationWarning.created_by: None}, synchronize_session=False
    )
    db.query(Suspension).filter(Suspension.created_by == user_id).update(
        {Suspension.created_by: None}, synchronize_session=False
    )
    db.query(Suspension).filter(Suspension.lifted_by == user_id).update(
        {Suspension.lifted_by: None}, synchronize_session=False
    )
    db.query(Report).filter(Report.handled_by == user_id).update({Report.handled_by: None}, synchronize_session=False)
