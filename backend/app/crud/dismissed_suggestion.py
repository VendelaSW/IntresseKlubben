"""
Databasoperationer för dismissed_suggestions - "ta bort kontaktförslag".

Ensidigt: bara den som döljer vet om det, och det påverkar inget annat
(ingen blockering, inga kontakter) - bara vilka som visas under Förslag
på Personer-sidan (se list_people i crud/profile.py och GET /users/).
"""

from sqlalchemy.orm import Session

from app.models.dismissed_suggestion import DismissedSuggestion


def dismiss_suggestion(db: Session, user_id: int, dismissed_user_id: int) -> None:
    """Markerar dismissed_user_id som bortvald av user_id. Idempotent - att
    ta bort samma förslag igen ger inget fel, bara ingen ny rad."""
    exists = (
        db.query(DismissedSuggestion)
        .filter(
            DismissedSuggestion.user_id == user_id,
            DismissedSuggestion.dismissed_user_id == dismissed_user_id,
        )
        .first()
    )
    if exists is not None:
        return
    db.add(DismissedSuggestion(user_id=user_id, dismissed_user_id=dismissed_user_id))
    db.commit()


def list_dismissed_user_ids(db: Session, user_id: int) -> set[int]:
    """Alla id:n user_id tidigare tagit bort som förslag."""
    rows = (
        db.query(DismissedSuggestion.dismissed_user_id)
        .filter(DismissedSuggestion.user_id == user_id)
        .all()
    )
    return {row[0] for row in rows}


def reset_dismissed_suggestions(db: Session, user_id: int) -> int:
    """Tar bort alla tidigare borttagna förslag för user_id, så de kan dyka
    upp igen i Förslag. Returnerar antalet rader som togs bort."""
    count = (
        db.query(DismissedSuggestion)
        .filter(DismissedSuggestion.user_id == user_id)
        .delete()
    )
    db.commit()
    return count
