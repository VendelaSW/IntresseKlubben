"""
Kandidatfilter för matchningen: vilka intressen AI:n ska få se när den kopplar oklara taggar till biblioteket.

Utan filter skickas hela biblioteket (ca 19 000 tokens) i varje matchningsanrop. Med filter skickas bara det som kan
vara rätt (ca 1 700 tokens). Kandidaterna är, bästa först:

1. Lokalt: intressen vars namn eller alias liknar taggen (också som enkla grundformer och delsträngar).
2. De K_PER_TAG närmaste till varje tagg, enligt embeddings.
3. De K_FOR_TEXT närmaste till hela texten (fångar sammanhang och sådant utläsningen tagit konstigt).
4. Alltid: alla huvudområden och föräldrarna till varje kandidat, så att AI:n kan lägga ett nytt intresse på rätt ställe.

Totalt högst MAX_CANDIDATES. Går det inte att räkna kandidaterna (ingen nyckel, OpenAI nere, vektorerna saknas eller
tabellen finns inte än) ger CandidateFinder None, och då får AI:n hela biblioteket som förut. Filtret kan alltså aldrig
göra att analysen slutar fungera, bara att den blir dyrare i de fallen.
"""

from dataclasses import dataclass

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.services.ai_clients import AIFailed, AINotConfigured, Deadline, Embedder, get_embedder
from app.services.interest_embeddings import nearest_interests
from app.services.interest_matching import LibraryIndex, Tag, normalize
from app.services.interest_shortcut import _WORD, _forms

K_PER_TAG = 5  # så många av de närmaste tas med för varje tagg
K_FOR_TEXT = 10  # och för hela texten
MAX_CANDIDATES = 100  # högst så här många intressen visas för AI:n (huvudområden och föräldrar räknas med)


def local_candidate_ids(tag: Tag, index: LibraryIndex) -> list[int]:
    """Intressen vars namn eller alias är taggen (eller dess ord eller grundformer), eller delar en delsträng på minst
    fyra tecken med den, i den ordning de hittades."""
    found: list[int] = []
    for name in tag.all_names():
        words = _WORD.findall(name)
        for length in (3, 2, 1):
            for start in range(len(words) - length + 1):
                for form in _forms(words[start : start + length]):
                    found.extend(item.id for item in index.find(form))
        wanted = normalize(name)
        if len(wanted) >= 4:
            for item in index.items:
                for other_name in (item.name, *item.aliases):
                    other = normalize(other_name)
                    if len(other) >= 4 and (wanted in other or other in wanted):
                        found.append(item.id)
    return list(dict.fromkeys(found))


def _with_ancestors(item_id: int, index: LibraryIndex) -> set[int]:
    chain: set[int] = set()
    current = index.by_id.get(item_id)
    while current is not None and current.id not in chain:
        chain.add(current.id)
        current = index.by_id.get(current.parent_id) if current.parent_id is not None else None
    return chain


@dataclass
class CandidateFinder:
    """Ger id:na på intressena som visas för AI:n för några oklara taggar i en text, eller None (då visas hela
    biblioteket). Skapas med databassessionen för varje anrop."""

    db: Session
    embedder: Embedder | None = None
    per_tag: int = K_PER_TAG
    for_text: int = K_FOR_TEXT
    maximum: int = MAX_CANDIDATES

    def __call__(self, tags: list[Tag], text: str, index: LibraryIndex, deadline: Deadline | None = None) -> set[int] | None:
        try:
            vectors = (self.embedder or get_embedder()).embed([*[tag.name for tag in tags], text], deadline)
        except (AIFailed, AINotConfigured):
            return None
        try:
            per_tag = [nearest_interests(self.db, vector, self.per_tag) for vector in vectors[:-1]]
            for_text = nearest_interests(self.db, vectors[-1], self.for_text)
        except SQLAlchemyError:
            # Tabellen finns inte än (koden är utrullad före migrationen) eller något annat gick fel i databasen. I
            # Postgres måste transaktionen rullas tillbaka innan sessionen kan användas igen.
            self.db.rollback()
            return None
        if not for_text:  # inga vektorer än (synken är inte körd): hela biblioteket
            return None

        ordered: list[int] = []
        for tag in tags:
            ordered.extend(local_candidate_ids(tag, index))
        for rank in range(self.per_tag):  # den närmaste för varje tagg först, sedan nästa
            ordered.extend(result[rank][0].id for result in per_tag if rank < len(result))
        ordered.extend(interest.id for interest, _ in for_text)

        chosen = {item.id for item in index.items if item.level == 1}  # alla huvudområden
        for item_id in ordered:
            if item_id not in index.by_id:
                continue
            chain = _with_ancestors(item_id, index)
            if len(chosen | chain) <= self.maximum:  # det som inte ryms hoppas över, de bästa kom först
                chosen |= chain
        return chosen
