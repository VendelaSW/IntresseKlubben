"""
Stavningskontroll för "Menade du" (GET /interests/similar): intressen vars namn eller alias liknar texten som skrivits,
oavsett felstavning, skrivsätt eller bindestreck ("klettra" -> Klättring, "Pokémon-TCG" -> Pokémon TCG, "Måla & teckna"
-> Måla och teckna). Det görs i kod, utan OpenAI: embeddings hittar liknande betydelse men är dåliga på felstavningar
(ett felstavat ord ligger närmare ett annat kort ord än det rätta, och likheten för en felstavning och ett annat intresse
överlappar).

Texten viks först (små bokstäver, å/ä/ö till a/o, utan skiljetecken, "&" som "och") och jämförs sedan med varje namn och alias
med editeringsavstånd. Hur långt ifrån det får vara beror på längden, så att korta ord inte blir något annat
(Löpning och Lödning är olika intressen, och i biblioteket finns många sådana par): se MAX_DISTANCE.
Det här är ett förslag till användaren, inte en sammanslagning, så de som ligger lika nära tas alla med.
"""

import re
import unicodedata

from app.services.interest_matching import LibraryIndex

MIN_LENGTH = 4  # kortare texter (efter vikning) får inget stavningsförslag
# (från så många tecken efter vikning, högst så många fel): längre ord tål fler fel
MAX_DISTANCE = ((12, 3), (8, 2), (MIN_LENGTH, 1))


def fold(text: str) -> str:
    """Jämförelseform för stavning: bara bokstäver och siffror, små bokstäver, å/ä/ö som a/o, utan accenter."""
    text = text.casefold().replace("&", " och ").replace("å", "a").replace("ä", "a").replace("ö", "o")
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", text)


def allowed_distance(length: int) -> int:
    return next((distance for minimum, distance in MAX_DISTANCE if length >= minimum), 0)


def edit_distance(a: str, b: str, limit: int) -> int:
    """Antal teckenändringar (infoga, ta bort, byta) mellan a och b, eller limit + 1 om det är fler än limit."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return min(previous[-1], limit + 1)


def spelling_matches(text: str, index: LibraryIndex) -> list[int]:
    """Id:na på intressena vars namn eller alias liknar `text` i stavningen, de närmaste först (minst avstånd, sedan
    kortast namn). Tom lista om texten är för kort efter vikning eller inget ligger inom avståndet."""
    wanted = fold(text)
    limit = allowed_distance(len(wanted))
    if len(wanted) < MIN_LENGTH:
        return []
    best: dict[int, tuple[int, int]] = {}
    for item in index.items:
        for name in (item.name, *item.aliases):
            form = fold(name)
            if len(form) < MIN_LENGTH:
                continue
            distance = edit_distance(wanted, form, limit)
            if distance <= limit and (item.id not in best or (distance, len(form)) < best[item.id]):
                best[item.id] = (distance, len(form))
    return sorted(best, key=lambda item_id: (best[item_id], item_id))


def folded_match(text: str, index: LibraryIndex) -> int | None:
    """Id på intresset om `text` är samma ord som ett namn eller alias med annat skrivsätt (versaler, accenter, bindestreck,
    mellanslag, å/ä/ö: "Pokemon TCG" och "Pokémon TCG", "mountain bike" och "Mountainbike"), annars None. Det gäller bara när
    det är ett enda intresse, så att ett namn som finns på flera ställen (Fantasy under Film och Böcker) lämnas åt matchningen.
    Det är inget avstånd: i biblioteket finns inga olika intressen som viks till samma sak, så det är lika säkert som en exakt träff."""
    wanted = fold(text)
    if len(wanted) < MIN_LENGTH:
        return None
    found = {item.id for item in index.items for name in (item.name, *item.aliases) if fold(name) == wanted}
    return found.pop() if len(found) == 1 else None
