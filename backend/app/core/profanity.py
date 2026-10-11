import re
from collections.abc import Iterator

BLOCKED_STEMS = {
    "nigger": ("", "s"),
    "nigga": ("", "s"),
    "faggot": ("", "s"),
    "fag": ("", "s"),
    "retard": ("", "s"),
    "chink": ("", "s"),
    "spic": ("", "s"),
    "kike": ("", "s"),
    "cunt": ("", "s"),
    "fuck": ("", "s", "er", "ers", "ing", "ed"),
    "motherfuck": ("er", "ers", "ing"),
    "neger": ("", "n", "ns", "s"),
    "negr": ("er", "erna", "ernas", "ers"),
    "blatt": ("e", "en", "ens", "es", "ar", "arna", "arnas", "ars"),
    "svartskall": ("e", "en", "ens", "es", "ar", "arna", "arnas", "ars"),
    "bögjävel": ("", "n", "ns", "s"),
    "bögjävl": ("ar", "arna", "arnas", "ars"),
    "fitt": ("a", "an", "ans", "as", "or", "orna", "ornas", "ors"),
    "hor": (
        "a", "an", "ans", "as", "or", "orna", "ornas", "ors",
        "unge", "ungen", "ungens", "unges", "ungar", "ungarna", "ungarnas", "ungars",
    ),
}

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "@": "a", "$": "s"})
_SYMBOL_LEET = str.maketrans({"@": "a", "$": "s"})
_NUMERIC_AFFIXES = re.compile(r"(?<![^\W_])\d+|\d+(?![^\W_])")
_ALLOWED_WORDS = {"fagott"}
_BLOCKED_FORMS = {
    re.sub(r"(.)\1+", r"\1", (stem + suffix).casefold())
    for stem, suffixes in BLOCKED_STEMS.items()
    for suffix in suffixes
}

_PATTERN = re.compile(
    r"\b(?:" + "|".join(re.escape(word) for word in sorted(_BLOCKED_FORMS, key=len, reverse=True)) + r")\b"
)


def _normalize(text: str, translate_digits: bool) -> tuple[str, list[tuple[int, int]]]:
    characters: list[str] = []
    spans: list[tuple[int, int]] = []
    translation = _LEET if translate_digits else _SYMBOL_LEET
    for index, original in enumerate(text):
        for character in original.casefold().translate(translation):
            character = character if character.isalpha() else " "
            if characters and characters[-1] == character:
                spans[-1] = (spans[-1][0], index + 1)
            else:
                characters.append(character)
                spans.append((index, index + 1))
    return "".join(characters), spans


def _matching_spans(text: str) -> Iterator[tuple[int, int]]:
    without_numeric_affixes = _NUMERIC_AFFIXES.sub(lambda match: " " * len(match.group()), text)
    for source, translate_digits in ((text, True), (text, False), (without_numeric_affixes, True)):
        normalized, spans = _normalize(source, translate_digits)
        for match in _PATTERN.finditer(normalized):
            start = spans[match.start()][0]
            end = spans[match.end() - 1][1]
            if text[start:end].casefold() not in _ALLOWED_WORDS:
                yield start, end


def censor_text(text: str) -> str:
    characters = list(text)
    for start, end in _matching_spans(text):
        characters[start:end] = ["*"] * (end - start)
    return "".join(characters)


def contains_profanity(text: str) -> bool:
    return next(_matching_spans(text), None) is not None


def validate_clean_text(text: str, field_name: str = "Innehållet") -> None:
    if contains_profanity(text):
        raise ValueError(f"{field_name} innehåller otillåtet språk.")
