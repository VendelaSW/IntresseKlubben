from app.core.profanity import censor_text, validate_clean_text
from app.services.ai_clients import AIFailed, AINotConfigured, Deadline, get_toxicity_classifier

TOXICITY_THRESHOLD = 0.5
FIELD_LABELS = {
    "username": "Användarnamnet", "name": "Namnet", "profile_text": "Om mig-texten",
    "district": "Stadsdelen", "title": "Titeln", "description": "Beskrivningen",
    "meeting_info": "Mötesinformationen", "place_name": "Platsnamnet", "address": "Adressen",
}


class ToxicContentError(Exception):
    pass


class ModerationUnavailableError(Exception):
    pass


class WordFilterError(Exception):
    def __init__(self, field: str, detail: str):
        self.field = field
        self.detail = detail
        super().__init__(detail)


def check_fields(
    *, ai: bool = False, labels: dict[str, str] | None = None, deadline: Deadline | None = None, **fields: str | None
) -> None:
    texts = {field: text for field, text in fields.items() if text is not None and text.strip()}
    for field, text in texts.items():
        label = (labels or {}).get(field, FIELD_LABELS.get(field, "Innehållet"))
        try:
            validate_clean_text(text, label)
        except ValueError as error:
            raise WordFilterError(field, str(error)) from None
    if not ai or not texts:
        return
    deadline = deadline if deadline is not None else Deadline()
    try:
        classifier = get_toxicity_classifier()
        for text in texts.values():
            result = classifier.classify(text, deadline)
            if result.flagged or result.score >= TOXICITY_THRESHOLD:
                raise ToxicContentError()
    except (AIFailed, AINotConfigured):
        raise ModerationUnavailableError() from None


def censor_message(text: str) -> str:
    return censor_text(text)