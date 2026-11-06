"""Gemensamma kontroller av text som skickas in."""

from app.core import error_messages as msg

MAX_MESSAGE_LENGTH = 2000


def required_text(value: str) -> str:
    """Texten i intervjun: utan mellanslag runtom, och inte tom."""
    value = value.strip()
    if not value:
        raise ValueError(msg.INTERVIEW_TEXT_EMPTY)
    return value


def message_text(value: str) -> str:
    """Ett meddelande, i brev och klubbchatt: utan mellanslag runtom, inte tomt och inte för långt."""
    value = value.strip()
    if len(value) == 0:
        raise ValueError("Meddelandet får inte vara tomt")
    if len(value) > MAX_MESSAGE_LENGTH:
        raise ValueError("Meddelandet får max vara 2000 tecken")
    return value
