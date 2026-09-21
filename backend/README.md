# Backend – Intresseklubben

FastAPI-backend. Kör lokalt:

```
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # fyll i DATABASE_URL (och ev. CORS_ORIGINS)
uvicorn app.main:app --reload
```

## Databasmigrationer (Alembic)

Kör en gång mot Neon-databasen innan första migrationen:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Skapa en ny migration efter att du ändrat/lagt till en modell i `app/models/`
(kom ihåg att importera modellfilen i `alembic/env.py` så autogenerate ser den):

```
alembic revision --autogenerate -m "beskrivning av ändringen"
```

Granska den genererade filen i `alembic/versions/` och kör sedan:

```
alembic upgrade head
```

Rulla tillbaka senaste migrationen vid behov:

```
alembic downgrade -1
```

## Deploy (Vercel)

Backend deployas som ett eget Vercel-projekt, separat från frontend:

1. Skapa ett nytt Vercel-projekt från repot och sätt **Root Directory** till `backend`.
2. Vercel hittar automatiskt FastAPI-appen via `app/main.py` (definierar `app`), och `requirements.txt` i samma mapp.
3. Sätt miljövariablerna i projektet: `DATABASE_URL` (Neons *pooled* connection-sträng, se `.env.example`) och `CORS_ORIGINS` (frontendens Vercel-URL, t.ex. `https://intresseklubben-frontend.vercel.app`).
4. `vercel.json` i den här mappen sätter en `maxDuration` på funktionen — höj vid behov.

`alembic upgrade head` körs inte automatiskt vid deploy — kör den manuellt (lokalt, mot samma `DATABASE_URL`) efter varje ny migration.
