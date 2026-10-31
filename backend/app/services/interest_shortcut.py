"""
Alias först: hitta intressen som redan finns i biblioteket utan att fråga AI:n.

Båda lägena använder bara intressenas namn och alias (samma uppslag som matchningens exakta träff, se
interest_matching.exact_match), aldrig en gissning:

1. Genväg (shortcut_tree): hela texten är en lista av intressen, där varje del exakt är ett namn eller alias
   ("Löpning, bouldering och yoga", "Brädspel"). Då behövs inget anrop alls, varken utläsning, granskning eller
   matchning. Biblioteket är redan granskat, och egna intressen granskades när de skapades.
2. Skyddsnät (local_tree): hittade utläsningen ingen tagg alls (modellen hoppar ibland över ett verb som
   "bada" fast det är alias till Bad och bastu) letar vi namn och alias i själva texten, också i enkla böjningar
   ("springer" -> "springa"). En modell kontrollerar att personen faktiskt har träffarna i dag (se
   interest_analysis._safety_net), och de går genom moderationen som modellens taggar. Användaren bekräftar
   förslagen som vanligt. Har granskningen eller moderationen tagit bort något
   körs inte skyddsnätet, så deras beslut gäller (se extract_interests, on_nothing).

Texter som visar tvivel eller negation ("jag hatar fotboll", "jag drömmer om att prova klättring", "jag har slutat
spela fotboll", "jag spelade fotboll förr") används aldrig: då avgör modellen. Ordlistan blir aldrig komplett, så
skyddsnätets träffar kontrolleras dessutom av en modell (det fångar också ord som betyder något annat, som "kör"). Tvetydiga namn avgörs inte här heller (exact_match ger då inget svar).
"""

import re

from app.core.profanity import contains_profanity
from app.services.interest_extractor import _has_sensitive_word
from app.services.interest_matching import LibraryIndex, LibraryItem, Tag, exact_match

MAX_SHORTCUT_PARTS = 8
MAX_SAFETY_NET = 5  # så många träffar tas högst med i skyddsnätet

# Ord som gör att texten kan säga motsatsen, något man slutat med eller något som inte är ett intresse man har.
_DOUBT = re.compile(
    r"\b(?:hatar|hata|ogillar|inte|aldrig|tråkigt|tråkig|drömmer|kanske|vill lära|slutat|slutade|slutar|lagt av|gav upp|brukade"
    r"|förr|tidigare)\b",
    re.IGNORECASE,
)
_SPLIT = re.compile(r",|;|/|\s+och\s+|\s+&\s+|\s+samt\s+", re.IGNORECASE)
_WORD = re.compile(r"[\wåäöÅÄÖ-]+")

# Enkla ändelser som tas bort eller byts mot -a, så att böjda verb och substantiv hittar grundformen
# (springer -> springa, simmar -> simma, hunden -> hund). Grovt, men träffarna kontrolleras mot biblioteket.
_ENDINGS = (("ar", "a"), ("er", "a"), ("ade", "a"), ("or", ""), ("en", ""), ("ar", ""), ("na", ""), ("r", ""))


def has_doubt(text: str) -> bool:
    return _DOUBT.search(text) is not None


def _resolve(name: str, index: LibraryIndex) -> LibraryItem | None:
    """Intresset ett namn eller alias betyder, om det går att avgöra utan modell."""
    return exact_match(Tag("t1", name), index)


def _forms(words: list[str]) -> set[str]:
    """Ordgruppen som den står, och för ett enda ord också dess enkla grundformer."""
    forms = {" ".join(words)}
    if len(words) == 1:
        word = words[0].lower()
        for ending, replacement in _ENDINGS:
            if word.endswith(ending) and len(word) > len(ending) + 2:
                forms.add(word[: -len(ending)] + replacement)
    return forms


def _node(name: str) -> dict:
    return {"name": name, "aliases": [], "subtags": []}


def shortcut_tree(text: str, index: LibraryIndex) -> list[dict] | None:
    """Intressena i texten som ett träd av taggar (samma form som utläsningen ger), om hela texten är en lista
    där varje del exakt är ett intresse i biblioteket. Annars None, och texten går den vanliga vägen."""
    if has_doubt(text):
        return None
    parts = [part.strip() for part in _SPLIT.split(text) if _WORD.search(part)]
    if not parts or len(parts) > MAX_SHORTCUT_PARTS:
        return None
    for part in parts:
        if contains_profanity(part) or _has_sensitive_word(part) or _resolve(part, index) is None:
            return None
    return [_node(part) for part in parts]


def local_tree(text: str, index: LibraryIndex) -> list[dict]:
    """Intressena vars namn eller alias står som ord eller ordgrupp (1-3 ord, också böjda) i texten, i den ordning
    de nämns. Ett huvudområde tas inte med när något mer specifikt inom det också hittades, och högst
    MAX_SAFETY_NET tas med. Tom lista om texten visar tvivel."""
    if has_doubt(text):
        return []
    words = _WORD.findall(text)
    found: dict[int, LibraryItem] = {}
    for start in range(len(words)):
        for length in (3, 2, 1):
            if start + length > len(words):
                continue
            for form in _forms(words[start : start + length]):
                item = _resolve(form, index)
                if item is not None and not contains_profanity(item.name) and not _has_sensitive_word(item.name):
                    found.setdefault(item.id, item)
    items = list(found.values())
    areas_with_more_specific = {item.path[0] for item in items if item.path}
    items = [item for item in items if not (item.level == 1 and item.name in areas_with_more_specific)]
    # Namnet måste leda tillbaka till samma intresse när det slås upp igen (inte ett tvetydigt namn).
    items = [item for item in items if (resolved := _resolve(item.name, index)) is not None and resolved.id == item.id]
    return [_node(item.name) for item in items[:MAX_SAFETY_NET]]
