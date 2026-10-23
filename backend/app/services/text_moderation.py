import logging

from app.core.profanity import censor_text, validate_clean_text
from app.services.ai_clients import Deadline, get_toxicity_classifier

logger = logging.getLogger(__name__)
TOXICITY_THRESHOLD = 0.5
FIELD_LABELS = {
    "username": "Användarnamnet", "name": "Namnet", "profile_text": "Om mig-texten",
    "district": "Stadsdelen", "title": "Titeln", "description": "Beskrivningen",
    "meeting_info": "Mötesinformationen", "place_name": "Platsnamnet", "address": "Adressen",
}


class ToxicContentError(Exception):
    pass


class WordFilterError(Exception):
    def __init__(self, field: str, detail: str):
        self.field = field
        self.detail = detail
        super().__init__(detail)


def check_fields(
    *, ai: bool = False, ai_text: str | None = None, labels: dict[str, str] | None = None,
    deadline: Deadline | None = None, **fields: str | None
) -> None:
    texts = {field: text for field, text in fields.items() if text is not None and text.strip()}
    for field, text in texts.items():
        label = (labels or {}).get(field, FIELD_LABELS.get(field, "Innehållet"))
        try:
            validate_clean_text(text, label)
        except ValueError as error:
            raise WordFilterError(field, str(error)) from None
    moderation_texts = (
        [ai_text] if ai_text is not None and ai_text.strip()
        else [] if ai_text is not None
        else list(texts.values())
    )
    if not ai or not moderation_texts:
        return
    deadline = deadline if deadline is not None else Deadline()
    try:
        classifier = get_toxicity_classifier()
        results = [classifier.classify(text, deadline) for text in moderation_texts]
    except Exception as error:
        logger.warning(
            "AI-moderering kunde inte köras; lokal ordkontroll används (%s)", type(error).__name__
        )
        return
    if any(result.flagged or result.score >= TOXICITY_THRESHOLD for result in results):
        raise ToxicContentError()


def censor_message(text: str) -> str:
    return censor_text(text)