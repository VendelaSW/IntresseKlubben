# Intresseklubben

**Vi antecknar, ni träffas.**

Intresseklubben är en svensk webbapplikation för att hitta människor att göra saker med utifrån gemensamma intressen. Det är **inte en dejtingapp**. Tanken är att göra det enklare att upptäcka likasinnade, organisera aktiviteter och ta steget från ett gemensamt intresse till en faktisk träff.

**[Besök Intresseklubben](https://intresse-klubben.vercel.app/)**

> Detta repository innehåller både frontend och backend. Dokumentationen nedan utgår från koden i `pre-dev` och beskriver implementerade moduler, inte ett löfte om att alla funktioner är tillgängliga i produktionsversionen.

## Funktioner

- **Profiler och intressen:** användarprofiler med beskrivning och intressen från ett strukturerat intressebibliotek.
- **Personer och matchning:** upptäck andra användare, filtrera och få personliga matchningsförslag.
- **Klubbar:** skapa och delta i intressebaserade grupper, med inlägg och gruppkommunikation.
- **Evenemang:** skapa och hitta aktiviteter med datum, plats och intresseanknytning.
- **Karta och plats:** kartbaserade vyer och platsval för aktiviteter och grupper.
- **Kontakter och meddelanden:** kontaktförfrågningar, privata konversationer och notifieringar.
- **AI-stöd:** analys av profiltext för att föreslå och strukturera intressen.
- **Trygghet:** rapportering, moderering och möjligheter att blockera användare.

## Så fungerar matchningen

Matchningen är en egen backendfunktion, huvudsakligen implementerad i [`backend/app/services/matching.py`](backend/app/services/matching.py) och [`match_suggestions.py`](backend/app/services/match_suggestions.py).

Den väger samman tre signaler:

1. **Gemensamma intressen:** exakta träffar och släktskap i ett hierarkiskt intresseträd. Smalare, mer specifika gemensamma intressen får större betydelse än enbart en bred överkategori.
2. **Närliggande intressen:** semantisk likhet mellan intresse-embeddings, så att exempelvis relaterade aktiviteter kan matcha utan att ha identiska etiketter.
3. **Profiltext:** semantisk likhet mellan vektorrepresentationer av användarnas presentationer.

Grundvikterna i den granskade versionen är **35 % gemensamma intressen, 30 % närliggande intressen och 35 % profiltext**. Den faktiska sammanvägningen justeras efter signalernas tillförlitlighet. Matchningspoängen är **riktningsberoende**: en användares matchning mot en annan behöver inte vara lika stark i motsatt riktning.

För att få matchningsförslag krävs i den granskade versionen minst **tre intressen** och **100 tecken profiltext**. Resultaten sorteras efter poäng och kan filtreras på bland annat kommun, kön och ålder. Blockerade användare, redan hanterade kontakter och avvisade förslag utesluts.

**Teknisk detalj:** pgvector används för likhetsberäkningar i PostgreSQL, medan den slutliga poängsättningen utförs i Python. Tester kan köra motsvarande beräkningar med SQLite. Tröskelvärdena är kalibrerade mot demodata och behöver valideras mot verklig användning.

## Teknikstack

| Del | Teknik |
| --- | --- |
| Frontend | React 18, Vite 5, React Router |
| Datainhämtning | TanStack React Query |
| Kartor | MapLibre GL |
| Backend | Python, FastAPI, Pydantic |
| ORM och migrationer | SQLAlchemy, Alembic |
| Databas | Neon PostgreSQL, PostGIS, pgvector |
| Inloggning | JWT, lösenordshashning |
| Bildlagring | S3-kompatibel objektlagring |
| AI | OpenAI API och sparade embeddings |
| E-post | Resend |
| Driftsättning | Vercel (separata frontend- och backendprojekt) |
| CI | GitHub Actions, pytest, frontend-build |

## Arkitektur

```text
Webbläsare
  └── React / Vite (frontend/)
        └── HTTP API (frontend/src/services/)
              └── FastAPI (backend/app/api/routes/)
                    ├── Pydantic-scheman
                    ├── Autentisering och behörighet
                    ├── CRUD / SQLAlchemy ── Neon PostgreSQL
                    │                         ├── PostGIS
                    │                         └── pgvector
                    └── Tjänstelager
                          ├── Matchning och embeddings
                          ├── Intresseanalys / AI
                          ├── E-post
                          └── Geokodning
```

Backend är uppdelad i routes, scheman, modeller, CRUD och tjänster. Frontend separerar sidor, återanvändbara komponenter och API-anrop.

## Projektstruktur

```text
.
├── .github/workflows/ci.yml   # Backendtester och frontendbygge
├── backend/
│   ├── app/
│   │   ├── api/routes/       # API-endpoints
│   │   ├── auth/             # Autentisering
│   │   ├── core/             # Konfiguration och gemensamma funktioner
│   │   ├── crud/             # Databasoperationer
│   │   ├── models/           # SQLAlchemy-modeller
│   │   ├── schemas/          # Pydantic-scheman
│   │   ├── services/         # Matchning, AI, e-post m.m.
│   │   └── devtools/         # Isolerat utvecklings-/testläge
│   ├── alembic/versions/     # Databasmigrationer
│   └── tests/                # pytest
├── frontend/
│   ├── public/             # Statiska filer som nås via URL
│   │   ├── fonts/          # Caveat och Inter
│   │   └── video/intervju/ # Intressekompisens intervjusekvenser
│   ├── src/
│   │   ├── assets/         # Importerade bilder, ikoner och animationer
│   │   │   └── startsida/  # Bilder och videoloopar på startsidan
│   │   ├── pages/            # Sidvyer
│   │   ├── components/       # Återanvändbara komponenter
│   │   ├── services/         # API-klienter
│   │   ├── hooks/            # React-hooks
│   │   └── styles/           # Designsystem och CSS
│   └── package.json
├── CONTRIBUTING.md           # Arbetsflöde och kodkonventioner
└── projektstruktur.md        # Infrastruktur och deployment
```

### Frontendens statiska resurser

- **`frontend/public/`** innehåller filer som serveras direkt från webbplatsens rot, bland annat typsnitten **Caveat** och **Inter** samt MP4-klipp i `video/intervju/` för Intressekompisens intervjuflöde.
- **`frontend/src/assets/`** innehåller resurser som används från React-koden, till exempel handritade navigationsikoner, illustrationer av Intressekompisen, ögon/pupiller och bilder. Under `startsida/` finns även bilder och korta videoloopar för olika intressen.

I Vite används filer i `public/` normalt med absoluta sökvägar från roten, medan resurser under `src/assets/` kan importeras i komponenter och hanteras av byggprocessen.

## Kom igång lokalt

### Förutsättningar

- Node.js och npm (CI använder Node 24)
- Python (CI använder Python 3.13)
- Tillgång till en PostgreSQL-databas med projektets nödvändiga tillägg, alternativt projektets isolerade testläge
- Miljövariabler för de integrationer som ska användas

### 1. Klona projektet

```bash
git clone https://github.com/VendelaSW/IntresseKlubben.git
cd IntresseKlubben
```

### 2. Starta backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
```

Konfigurera `.env` innan du startar servern. Kör sedan:

```bash
uvicorn app.main:app --reload
```

Backend kör normalt på `http://localhost:8000`. API-dokumentation finns på `http://localhost:8000/docs` och hälsokontroller på `/health` och `/health/db`.

### 3. Starta frontend

Öppna en ny terminal från repots rot:

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

Sätt `VITE_API_URL=http://localhost:8000` i frontendens `.env`. Frontend kör normalt på `http://localhost:5173`.

### 4. Databasmigrationer

När databasanslutningen är konfigurerad och rätt PostgreSQL-tillägg finns installerade:

```bash
cd backend
alembic upgrade head
```

**Varning:** migrationer ändrar databasen som `DATABASE_URL` pekar på. Kontrollera miljön innan kommandot körs. I den dokumenterade uppsättningen delar utveckling, preview och produktion databas, vilket innebär att en migration kan påverka samtliga miljöer. Se [`backend/README.md`](backend/README.md) för detaljer om PostGIS och migrationshantering.

## Miljövariabler

Kopiera respektive `.env.example` och fyll i de värden som behövs. Lägg aldrig in riktiga nycklar i Git.

| Variabel | Syfte |
| --- | --- |
| `DATABASE_URL` | PostgreSQL-anslutning |
| `CORS_ORIGINS` | Tillåtna frontend-origin |
| `JWT_SECRET` | Signering av inloggningstoken |
| `S3_BUCKET`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` | Objektlagring |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Åtkomst till objektlagring |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | AI-baserad intresseanalys |
| `RESEND_API_KEY`, `EMAIL_FROM` | Utgående e-post |
| `FRONTEND_URL` | Länkar i e-post |
| `VITE_API_URL` | Frontendens backendadress |

Vissa integrationer kan vara avstängda i lokal utveckling. Läs kommentarer i [`backend/.env.example`](backend/.env.example) för ytterligare konfiguration.

## Testning och kvalitet

Backend har en omfattande automatiserad testsvit med **2 171 insamlade testfall** (verifierat med `pytest --collect-only` den 4 november 2026). Antalet avser insamlade testfall, inklusive parametriserade fall, och innebär inte i sig att samtliga tester passerar. Testerna använder enligt projektets CI-konfiguration **SQLite i minnet**, utan att kontakta produktionsdatabasen eller objektlagringen.

```bash
cd backend
pytest
```

Frontend byggs med:

```bash
cd frontend
npm run build
```

GitHub Actions kör backendtester och frontendbygge vid pull requests mot `pre-dev`, `dev` och `main` samt pushar till `pre-dev` och `dev`. Frontendens CI-steg är ett **byggtest**, inte en separat automatiserad frontendtestsvit.

## Arbetsflöde

Projektet använder feature-branches och pull requests:

```text
feature-branch → pre-dev → dev → main
```

- `pre-dev`: integration av färdiga features
- `dev`: samlad test- och previewmiljö
- `main`: produktion

Projektet använder Jira och korta sprintar, med roterande scrum master och produktägare. Se [`CONTRIBUTING.md`](CONTRIBUTING.md) för kodgranskning, branchregler, testning och migrationsrutiner.

## Deployment

Frontend och backend driftsätts som **två separata Vercel-projekt** från samma repository, med `frontend` respektive `backend` som Root Directory. Frontendens `VITE_API_URL` pekar på aktuell backend; backendens `CORS_ORIGINS` måste tillåta aktuell frontendadress.

Databasmigrationer körs **inte automatiskt** vid deployment. Se [`projektstruktur.md`](projektstruktur.md) för detaljer om miljöer, Neon och Vercel.

## Design

Gränssnittet har en lekfull, handritad visuell identitet. Färger, typografi, knappar och komponentmönster samlas i frontendens designvariabler och stilguide. Starta frontend och besök `/stilguide` för exempel. Nya återanvändbara mönster bör dokumenteras där.

## Team

Projektet utvecklas av **Nicklas, Emmy, Leonard, Filip och Vendela**. Alla arbetar som utvecklare; scrum master- och produktägaransvar roterar inom teamet.

## Vidare dokumentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) – utvecklingsflöde och kodkonventioner
- [`backend/README.md`](backend/README.md) – backend, databas och migrationer
- [`frontend/README.md`](frontend/README.md) – frontend, stilguide och deployment
- [`projektstruktur.md`](projektstruktur.md) – Vercel, Neon och miljöer
- [`testa-pa-mobilen.md`](testa-pa-mobilen.md) – lokal testning på mobil

---

*README:n beskriver kodbasen i den granskade `pre-dev`-versionen. Kontrollera release-status och miljökonfiguration före publicering.*
