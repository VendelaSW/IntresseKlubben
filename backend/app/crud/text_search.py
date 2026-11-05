"""Textsökning som delas av flera crud-moduler (klubbar och intressen). En egen fil, så att de inte behöver
importera från varandra."""


def escape_like(text: str) -> str:
    """Texten att söka på med LIKE. % och _ är jokertecken i LIKE. Här ska de betyda sig själva."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# Å, Ä och Ö sist och i den ordningen, som i ett svenskt alfabet (str.lower() lägger Ä före Å).
_SWEDISH_LAST = str.maketrans({"å": "{", "ä": "|", "ö": "}"})


def swedish_key(text: str) -> str:
    """Sorteringsnyckel för namn i svensk ordning, utan att skilja på stora och små bokstäver."""
    return text.lower().translate(_SWEDISH_LAST)
