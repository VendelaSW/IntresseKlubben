"""Åldersgränsen i appen (SCRUM-312): man ska ha fyllt 13 och vara högst 100 år.

Samma gräns gäller profilen (schemas/profile.py) och åldersfiltren i GET /users/ och GET /matches. Frontend har samma
värden i src/utils/age.js.
"""

from datetime import date

MIN_AGE = 13
MAX_AGE = 100


def age_on(birth_date: date, today: date) -> int:
    """Hur många år den som är född `birth_date` har fyllt den dagen `today`."""
    had_birthday_this_year = (today.month, today.day) >= (birth_date.month, birth_date.day)
    return today.year - birth_date.year - (0 if had_birthday_this_year else 1)
