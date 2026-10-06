import re

from fastapi import HTTPException

# Bara grova svordomar och glåpord. Matchas som hela ord så att t.ex.
# "Scunthorpe" eller "nigeriansk" inte censureras.
BLOCKED_WORDS = [
    # Engelska
    "nigger", "niggers", "nigga", "niggas",
    "faggot", "faggots", "fag", "fags",
    "retard", "retards",
    "chink", "chinks", "spic", "spics", "kike", "kikes",
    "cunt", "cunts",
    "fuck", "fucks", "fucker", "fuckers", "fucking", "motherfucker", "motherfuckers",
    # Svenska
    "neger", "negrer", "negern",
    "blatte", "blattar", "svartskalle", "svartskallar",
    "bögjävel", "fitta", "fittor", "hora", "horor",
]

_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in sorted(BLOCKED_WORDS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)


def censor_text(text: str) -> str:
    return _PATTERN.sub(lambda m: "*" * len(m.group(0)), text)


def contains_profanity(text: str) -> bool:
    return _PATTERN.search(text) is not None


def validate_clean_text(text: str, field_name: str = "Innehållet") -> None:
    if contains_profanity(text):
        raise HTTPException(status_code=400, detail=f"{field_name} innehåller otillåtet språk.")
