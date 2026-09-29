# Importerar alla modeller så att SQLAlchemy känner till dem innan någon
# databasfråga körs - annars kan relationer som pekar mellan modeller via
# strängnamn (t.ex. relationship("Interest", ...) i User) inte lösas upp.
from app.models.user import User  # noqa: F401
from app.models.interest import Interest  # noqa: F401