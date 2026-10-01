# Projektstruktur och deploy – Intresseklubben

**Kodens struktur** (mappar, hur ett anrop går genom koden, vilken feature man kan kopiera) beskrivs i [`CONTRIBUTING.md`](CONTRIBUTING.md), avsnitt 1. Den här filen beskriver hur projektet är uppsatt i Vercel, Neon och GitHub.

## Två Vercel-projekt

Backend och frontend ligger i samma repo men deployas som **två separata Vercel-projekt**, ett per mapp, med "Root Directory" satt till respektive mapp.

| Vercel-projekt | Root Directory | Production byggs från | Preview byggs från |
|---|---|---|---|
| `intresse-klubben-eick` (backend) | `backend` | `main` | `dev` |
| `intresse-klubben` (frontend) | `frontend` | `main` | `dev` |

Vercel känner igen FastAPI (`app/main.py`) och Vite automatiskt, så inget byggkommando behöver anges.

**Adresser för dev-previewn:**
- Frontend: `https://intresse-klubben-git-dev-intresse-klubben.vercel.app`
- Backend: `https://intresse-klubben-eick-git-dev-intresse-klubben.vercel.app`

## Miljövariabler

Alla variabler finns som namn i respektive `.env.example`. Lokalt sätts de i `.env`; i Vercel i rätt projekt, för både **Preview** och **Production**.

### Backend (`intresse-klubben-eick`)

| Variabel | Vad | Sensitive |
|---|---|---|
| `DATABASE_URL` | Neons *pooled* connection-sträng | Ja |
| `CORS_ORIGINS` | Frontendens adress(er), kommaseparerade | Nej |
| `JWT_SECRET` | Nyckel som inloggningstoken signeras med, **olika** för Preview och Production | Ja |
| `S3_BUCKET` | Bucketen för profilbilder | Nej |
| `AWS_ENDPOINT_URL_S3` | Bucketens adress hos Neon | Nej |
| `AWS_ACCESS_KEY_ID` | Bucketens nyckel-id | Ja |
| `AWS_SECRET_ACCESS_KEY` | Bucketens hemliga nyckel | Ja |
| `AWS_REGION` | Bucketens region | Nej |

### Frontend (`intresse-klubben`)

| Variabel | Vad |
|---|---|
| `VITE_API_URL` | Backendens adress. **Preview** ska peka på backendens dev-preview, **Production** på backendens produktionsadress. |

### Att tänka på
- Inga citattecken runt värdena i Vercel. Vercel sparar exakt det du skriver.
- Nya eller ändrade variabler gäller först efter en **Redeploy** av rätt deployment.
- `VITE_API_URL` byggs in i frontendens JavaScript när den byggs, så en ändring kräver alltid en ny build.

## Databas och lagring (Neon)

- **En gemensam Postgres-databas** för lokal utveckling, dev-previewn och produktion. En migration påverkar därför alla direkt. Se migrationsrutinen i `CONTRIBUTING.md`, avsnitt 3.
- `session.py` använder `pool_pre_ping=True` eftersom backend körs serverless; varje anrop kan vara en ny funktionsinstans.
- Vercel kör inga migrationer automatiskt vid deploy.
- **Profilbilder** ligger i en S3-kompatibel bucket i Neon som är publikt läsbar. Webbläsaren laddar upp direkt till bucketen via en signerad länk från backend.

## GitHub

- `dev` är huvudbranch för utveckling, `main` för releaser. Ingen pushar direkt till någon av dem.
- Branch protection på `dev` kräver att CI är grön (`Backend-tester`, `Frontend-bygge`) och att branchen är uppdaterad mot `dev`.
- CI-konfigurationen finns i `.github/workflows/ci.yml`.
