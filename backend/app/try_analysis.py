"""
Prova intervjuns analys med riktig AI, utan appen: skickar meningar genom analysen och skriver ut förslagen och
vilka steg som kördes. Bra för att se att skyddsnätet och dess kontroll (SCRUM-261) och utövar eller intresserad
(SCRUM-271) blir rätt med den riktiga modellen, som testerna inte kan visa (de fejkar AI:n).

Kör från backend/:

    python -m app.try_analysis                                     # exempelmeningarna nedan
    python -m app.try_analysis "Jag kör bil" "Jag älskar att bada"  # egna meningar

Läser bara biblioteket ur databasen (DATABASE_URL) och sparar ingenting: inga konton, intressen eller förslag.
Kräver OPENAI_API_KEY och OPENAI_MODEL, och varje mening kostar några små AI-anrop. Matchningen körs utan
kandidatsökningen (embeddings), så inga vektorer räknas eller sparas.
"""

import sys

from app.crud.interest import load_library_index
from app.crud.interest_library import load_activities
from app.db.session import SessionLocal
from app.services.ai_clients import AIFailed, AINotConfigured, get_llm, set_clients
from app.models.user_interest import PRACTISES
from app.services.interest_analysis import analyze

# Meningar där skyddsnätet kan slå till, och om man utövar eller bara är intresserad, och vad som borde hända.
EXAMPLES = [
    ("Jag älskar att bada", "Bad och bastu"),
    ("Jag kör bil till jobbet varje dag", "inte Sjunga i kör, inte Bilar"),
    ("Jag älskar att köra bil på helgerna", "Bilar"),
    ("Jag spelade fotboll förr", "inte Fotboll"),
    ("Jag har slutat spela fotboll", "inte Fotboll"),
    ("Jag lagar cykeln själv", "inte Matlagning"),
    ("Jag sjunger i kör på torsdagar", "Sjunga i kör"),
    ("Jag spelar piano", "Piano (utövar)"),
    ("Jag lyssnar på musik", "Musik"),
    ("Jag bakar, och gillar att äta bakelser", "Bakning (utövar), Bakelser"),
    ("Jag gillar fotboll", "Fotboll"),
]


class RecordingLLM:
    """Språkmodellen, men med en lista över vilka steg som anropades och vad kontrollen av skyddsnätet svarade."""

    def __init__(self, llm):
        self.llm = llm
        self.steps: list[str] = []
        self.checks: list[tuple[str, list]] = []

    def complete_json(self, *, system, user, name, schema, deadline=None):
        self.steps.append(name)
        answer = self.llm.complete_json(system=system, user=user, name=name, schema=schema, deadline=deadline)
        if name == "check":
            self.checks.append((user.rpartition("Intressen:\n")[2], answer.get("keep") if isinstance(answer, dict) else answer))
        return answer


def main() -> None:
    sentences = [(text, "") for text in sys.argv[1:]] or EXAMPLES
    try:
        llm = RecordingLLM(get_llm())
    except AINotConfigured:
        print("OPENAI_API_KEY och OPENAI_MODEL behövs i backend/.env.")
        sys.exit(1)
    set_clients(llm=llm)
    db = SessionLocal()
    try:
        index, catalog = load_library_index(db), load_activities()
    finally:
        db.close()

    for text, expected in sentences:
        llm.steps.clear()
        llm.checks.clear()
        try:
            names = [
                p["interest"]["name"] + (" (utövar)" if p["activity"] == PRACTISES else "")
                for p in analyze(text, index, catalog).proposals
            ]
            result = ", ".join(names) or "(inga förslag)"
        except AIFailed as err:
            result = f"(fel: {err})"
        print(f"\n{text}")
        print(f"  Förslag:  {result}")
        if expected:
            print(f"  Väntat:   {expected}")
        print(f"  Steg:     {', '.join(llm.steps) or 'inga AI-anrop (genvägen)'}")
        for found, kept in llm.checks:
            print(f"  Skyddsnätet hittade {found}, kontrollen behöll {kept}")
    set_clients()


if __name__ == "__main__":
    main()
