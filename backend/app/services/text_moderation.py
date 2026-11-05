from app.core.profanity import censor_text, validate_clean_text

FIELD_LABELS = {
    "username": "Användarnamnet", "name": "Namnet", "profile_text": "Om mig-texten",
    "district": "Stadsdelen", "title": "Titeln", "description": "Beskrivningen",
    "meeting_info": "Mötesinformationen", "place_name": "Platsnamnet", "address": "Adressen",
}


class WordFilterError(Exception):
    def __init__(self, field: str, detail: str):
        self.field = field
        self.detail = detail
        super().__init__(detail)


def check_fields(*, labels: dict[str, str] | None = None, **fields: str | None) -> None:
    texts = {field: text for field, text in fields.items() if text is not None and text.strip()}
    for field, text in texts.items():
        label = (labels or {}).get(field, FIELD_LABELS.get(field, "Innehållet"))
        try:
            validate_clean_text(text, label)
        except ValueError as error:
            raise WordFilterError(field, str(error)) from None


def censor_message(text: str) -> str:
    return censor_text(text)