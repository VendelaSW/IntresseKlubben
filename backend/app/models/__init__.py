# Importerar alla modeller så att SQLAlchemy känner till dem innan någon
# databasfråga körs - annars kan relationer som pekar mellan modeller
# (t.ex. User/Profile/Interest) inte lösas upp.
from app.models.user import User  # noqa: F401
from app.models.municipality import Municipality  # noqa: F401
from app.models.profile import Profile  # noqa: F401
from app.models.interest import Interest  # noqa: F401
from app.models.interest_embedding import InterestEmbedding  # noqa: F401
from app.models.profile_embedding import ProfileEmbedding  # noqa: F401
from app.models.user_interest import UserInterest  # noqa: F401
from app.models.contact import Contact  # noqa: F401
from app.models.message import Message  # noqa: F401
from app.models.conversation_read import ConversationRead  # noqa: F401
from app.models.group import Group, GroupInvitation, GroupJoinRequest, GroupMember  # noqa: F401
from app.models.group_message import GroupMessage  # noqa: F401
from app.models.group_post import GroupPost  # noqa: F401
from app.models.dismissed_suggestion import DismissedSuggestion  # noqa: F401
from app.models.event import Event, EventHost, EventInvitation, EventJoinRequest, EventResponse  # noqa: F401
from app.models.email_token import EmailToken  # noqa: F401
from app.models.report import Report  # noqa: F401
from app.models.suspension import Suspension  # noqa: F401
from app.models.moderation_warning import ModerationWarning  # noqa: F401
from app.models.notification import Notification  # noqa: F401
