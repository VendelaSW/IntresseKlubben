"""
Testläget: appen lokalt med en egen databas och färdig testdata, för att klicka runt och testa nya features
innan de mergas. Starta med `npm run dev:test` från frontend/ (eller `python -m app.devtools.server` från
backend/), se CONTRIBUTING.md.

- server.py: startar backend mot en tillfällig SQLite-fil (aldrig Neon), med fejkad AI och utan riktiga mejl,
  och fyller den med testdata.
- seed.py: testkontona och deras klubbar, events, brev och kontakter, även jobbiga fall (långa namn och texter,
  tomma listor).
- routes.py: /dev/... för "Logga in som ...", scenarier ("ge mig en kontaktförfrågan") och att börja om.
- fake_ai.py: fejkade AI-klienter, så att intervjun fungerar utan OpenAI.

Allt här är avstängt om inte DEV_MODE är satt, och vägrar starta mot något annat än SQLite eller på Vercel (se
assert_safe). Ett test kontrollerar att inga /dev-adresser finns i den vanliga appen.
"""



class UnsafeDevMode(RuntimeError):
    """Testläget är påslaget där det inte får vara det."""


def assert_safe() -> None:
    """Stoppar starten om testläget skulle köras mot en riktig databas eller på Vercel."""
    # Importeras här och inte överst, så att server.py hinner sätta sina miljövariabler innan inställningarna läses.
    from app.core.config import settings

    if not settings.database_url.startswith("sqlite"):
        raise UnsafeDevMode("Testläget får bara köras mot en SQLite-databas, aldrig mot Neon.")
    if settings.vercel_env:
        raise UnsafeDevMode("Testläget får inte köras på Vercel.")
