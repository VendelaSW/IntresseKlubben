# Intresseklubben

Intresseklubben är en webbtjänst som hjälper människor att hitta vänner utifrån
delade intressen, som ett alternativ till dagens ytliga dejtingappar. Det är svårt att hitta andra som delar precis ditt intresse nära dig, och nästan lika svårt att hitta ett självklart ställe att ses på. Intresseklubben löser båda delarna.

🔗 Live: https://intresse-klubben.vercel.app/

## Vad är Intresseklubben?

Användare skapar en profil och listar sina intressen, går med i eller skapar
grupper kring ett intresse, och ser andra användare eller intressegrupper på en karta för att hitta likasinnade nära sig. Målet är att sänka tröskeln för att gå från "vi delar ett intresse" till "vi ses".

## Tech stack

- **Frontend**: React + Vite, deployat på Vercel
- **Backend**: FastAPI + SQLAlchemy/Alembic, PostGIS-databas (Neon), deployat på Vercel
- **Projektledning**: Jira (sprintar om en vecka), GitHub
- **Standups**: egenbyggd Discord-bot som spelar in, transkriberar och sammanfattar

Se `backend/README.md` och `frontend/README.md` för lokal setup, och
`projektstruktur.md` för en detaljerad genomgång av mappstrukturen.

## Team & ansvarsfördelning

| Namn | Roll |
|---|---|
| Nicklas | Utvecklare, roterar som scrum master |
| Emmy | Utvecklare, roterar som scrum master |
| Leonard | Utvecklare, roterar som scrum master |
| Filip | Utvecklare, roterar som produktägare |
| Vendela | Utvecklare, roterar som produktägare |

Produktägarrollen roterar mellan Filip och Vendela, och scrum master-rollen
roterar mellan Nicklas, Emmy och Leonard. Alla är lika delar utvecklare i projektet.

## Kom igång

- `backend/` – se `backend/README.md`
- `frontend/` – se `frontend/README.md`

Deploy: två separata Vercel-projekt (ett per mapp, `Root Directory` satt till
`backend` respektive `frontend`) — se respektive README för miljövariabler.
