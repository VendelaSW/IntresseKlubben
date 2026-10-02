# Importerar alla modeller så att SQLAlchemy känner till dem innan någon
# databasfråga körs - annars kan relationer som pekar mellan modeller
# (t.ex. User/Profile/Interest) inte lösas upp.
from app.models.user import User  # noqa: F401
from app.models.municipality import Municipality  # noqa: F401
from app.models.profile import Profile  # noqa: F401
from app.models.interest import Interest  # noqa: F401
from app.models.associations import user_interests  # noqa: F401
from app.models.contact import Contact  # noqa: F401
from app.models.message import Message  # noqa: F401
from app.models.group import Group, GroupMember  # noqa: F401