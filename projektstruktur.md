# Projektstruktur – Intresseklubben

Backend och frontend deployas som **två separata Vercel-projekt** (ett per mapp, med "Root Directory" satt till respektive mapp i Vercel-panelen).

```
IntresseKlubben/
├── README.md                      Pekar till backend/frontend + kort deploy-not
├── .gitignore
│
├── backend/                       FastAPI-API (eget Vercel-projekt, Root Directory = backend)
│   ├── README.md                  Lokal setup, Alembic-kommandon, deploy-steg
│   ├── requirements.txt           fastapi, uvicorn, sqlalchemy, psycopg2-binary, geoalchemy2, alembic, ...
│   ├── vercel.json                 Function-config (maxDuration) för app/main.py
│   ├── .env.example                 DATABASE_URL (Neon, pooled-sträng), CORS_ORIGINS
│   ├── alembic.ini                  Alembic-config
│   ├── alembic/
│   │   ├── env.py                   Kopplar Alembic mot Settings.database_url + Base.metadata
│   │   ├── script.py.mako           Mall för nya migrationsfiler
│   │   └── versions/                Genererade migrationer (tom nu)
│   ├── app/
│   │   ├── main.py                  FastAPI-app + CORS. Vercels entrypoint (app/main.py → "app")
│   │   ├── core/config.py           Settings (miljövariabler)
│   │   ├── db/
│   │   │   ├── base.py              Delad SQLAlchemy Base – modeller ärver från denna
│   │   │   └── session.py           Engine (pool_pre_ping för serverless) + SessionLocal
│   │   ├── models/                  Tom – SQLAlchemy-modeller läggs här
│   │   ├── schemas/                  Tom – Pydantic-scheman läggs här
│   │   ├── services/                  Tom – affärslogik läggs här
│   │   └── api/routes/                Tom – API-endpoints läggs här
│   └── tests/                        Tom – testfiler läggs här
│
└── frontend/                       React + Vite (eget Vercel-projekt, Root Directory = frontend)
    ├── README.md                   Lokal setup + deploy-steg
    ├── package.json                react, react-dom, react-router-dom, vite
    ├── vercel.json                  Rewrite till index.html (SPA-routing)
    ├── vite.config.js
    ├── index.html
    ├── .env.example                  VITE_API_URL
    ├── public/
    └── src/
        ├── main.jsx / App.jsx
        ├── components/, pages/, hooks/   Tomma – byggs vidare på
        ├── services/api.js             Anropar backend via VITE_API_URL
        ├── styles/index.css
        └── assets/
```

## Deploy-upplägg

Två separata Vercel-projekt kopplade till samma repo:

| Projekt | Root Directory | Miljövariabler |
|---|---|---|
| backend | `backend` | `DATABASE_URL` (Neon, pooled), `CORS_ORIGINS` (frontendens URL) |
| frontend | `frontend` | `VITE_API_URL` (backendens URL) |

Vercel känner igen FastAPI (`app/main.py`) och Vite automatiskt — inget byggkommando behöver anges manuellt.

## Övrigt att notera

- `session.py` använder `pool_pre_ping=True` och `.env.example` rekommenderar Neons *pooled* connection-sträng, eftersom backend körs serverless (varje anrop kan vara en ny funktionsinstans).
- Alembic-migrationer körs manuellt (lokalt mot samma databas) — Vercel kör inga migrationer automatiskt vid deploy.
- Inga modeller/endpoints implementerade än – mapparna finns som platshållare.
