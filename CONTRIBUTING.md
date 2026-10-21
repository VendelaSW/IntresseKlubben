# Så bygger vi Intresseklubben

Den här guiden beskriver hur en feature går från ticket till merge, hur koden hänger ihop och vad vi har kommit överens om. Den ersätter den gamla `FEATURE_WORKFLOW.pdf`.

**Du kan inte förstöra `pre-dev` eller `dev` av misstag.** Allt går via pull requests, CI testar varje PR automatiskt, någon annan granskar innan merge, och allt i Git går att backa. Så experimentera, fråga och öppna PR:er tidigt.

---

## 1. Så hänger koden ihop

Backend (FastAPI) och frontend (React + Vite) ligger i samma repo men deployas som två separata Vercel-projekt.

Bara `main` och `dev` deployas automatiskt (`git.deploymentEnabled` i `frontend/vercel.json` och `backend/vercel.json`). Gratisplanen tillåter 100 deployer per dag, och varje push till en branch kostade två (ett per projekt), så feature-branches, `pre-dev` och PR:er får ingen egen förhandsvisning. Testa lokalt innan du öppnar en PR (på mobilen också, se [testa-pa-mobilen.md](testa-pa-mobilen.md)), och samla gärna ändringarna så att du pushar mer sällan. Behöver en PR ändå en förhandsvisning går det att starta en deploy för branchen manuellt i Vercel.

### Från feature till produktion

```
feat/... ──PR──▶ pre-dev ──PR──▶ dev ──PR──▶ main
                 (samlas, ingen    (deployas,     (produktion)
                  deploy)           Neon följer dev)
```

1. **Feature-branch:** bygg klart en hel feature i sin egen branch från `pre-dev`.
2. **PR till `pre-dev`:** granskas och mergas som vanligt. `pre-dev` är där features möts; den deployas inte, så den kostar inget.
3. **PR från `pre-dev` till `dev`:** när ett gäng features är klara och fungerar ihop lokalt. Då deployas `dev`, och migrationer och synk av intressebiblioteket körs mot Neon (se avsnitt 3).
4. **PR från `dev` till `main`:** när `dev` är testad. Det är produktionen.

### Ett anrop från början till slut

```
Webbläsaren                Frontend                         Backend                        Databas
 klick på "Spara" ──▶ pages/ProfilePage.jsx
                       └▶ services/profile.js
                           └▶ services/api.js  ── HTTP + token ──▶ api/routes/profile.py
                                                                    ├▶ auth/security.py   (vem är inloggad?)
                                                                    ├▶ schemas/profile.py (är datan giltig?)
                                                                    └▶ crud/profile.py ───────────▶ Neon (Postgres)
                                                                          └▶ models/profile.py
```

- **`services/api.js`** skickar med inloggningstoken i varje anrop och tolkar backendens felmeddelanden. Anropa aldrig `fetch` direkt i en sida.
- **`auth/security.py`** har `get_current_user`, som avgör vem som är inloggad. Routes som kräver inloggning tar in den med `Depends(get_current_user)`.
- **`schemas/`** bestämmer vad som får komma in och vad som skickas ut. Validering (t.ex. "Namn får inte vara tomt") hör hemma här.
- **`crud/`** pratar med databasen. **`routes/`** hanterar HTTP. Blanda inte de två.

### Var saker ligger

```
backend/
├── app/
│   ├── main.py                 skapar appen och kopplar in alla routrar
│   ├── core/config.py          inställningar från miljövariabler
│   ├── core/storage.py         bucketen för profilbilder
│   ├── db/session.py           databasanslutning och get_db()
│   ├── auth/security.py        lösenord, token och get_current_user
│   ├── models/                 tabeller (SQLAlchemy), en fil per tabell
│   ├── schemas/                in- och utdata (Pydantic)
│   ├── crud/                   databasoperationer
│   ├── api/routes/             endpoints, en fil per resurs
│   └── devtools/               testläget (se "Testa i testläget" nedan)
├── alembic/versions/           migrationer
└── tests/                      tester (pytest)

frontend/src/
├── App.jsx                     alla sidor/routes
├── pages/                      hela sidor
├── components/                 återanvändbara delar
├── hooks/                      delad logik (t.ex. inloggningsstatus)
├── services/                   anrop till backend, en fil per resurs
├── devtools/                   testlägets "Logga in som ..." och testpanel
└── styles/                     CSS
```

### Kopiera en färdig feature: intressen

Intressen är byggd hela vägen och följer alla konventioner. Öppna filerna i den här ordningen när du bygger något nytt:

| Steg | Fil |
|---|---|
| Migration | `backend/alembic/versions/c4d8e2a91f67_seed_interests_and_index.py` |
| Modell | `backend/app/models/interest.py` |
| Schema | `backend/app/schemas/interest.py` |
| Databaslogik | `backend/app/crud/interest.py` |
| Endpoints | `backend/app/api/routes/interests.py` |
| Tester | `backend/tests/test_interests.py` |
| Frontend-anrop | `frontend/src/services/interests.js` |
| Komponenter | `frontend/src/components/InterestExplorer.jsx`, `InterestTree.jsx` (profilens intressen som träd), `InterestTags.jsx` (platta taggar) |
| Används i | `frontend/src/pages/ProfilePage.jsx`, `UserProfilePage.jsx` |

---

## 2. Från ticket till merge

### Innan du börjar koda

Läs ticketen och kontrollera att de här frågorna är besvarade. Fråga PO om något saknas.

- **Vad ska fungera?** (acceptance criteria)
- **Vad får andra användare se?** Data om andra skickas med ett eget, mindre schema, aldrig samma som för din egen profil.
- **Överlappar det något som redan finns?** Då ska det stå vilket som blir kvar: bygg vidare på det befintliga eller ersätt det, men lämna inte två versioner sida vid sida.
- **Vad beror det på?** T.ex. "kräver inloggning" eller "bygger på contacts". Då vet du vilka PR:er som behöver vara mergade först.

Osäker på upplägget? Skriv två rader i ticketen eller ta det på standup innan du kodar. Det är mycket billigare att ändra riktning då än i review.

### Steg för steg

1. **Skapa en branch från senaste `pre-dev`:**
   ```
   git switch pre-dev
   git pull
   git switch -c feat/kort-beskrivning
   ```
2. **Bygg i lager**, som i intressen-exemplet: modell → migration → schema → crud → route → koppla in routern i `main.py` → tester → frontend-anrop i `services/` → sida/komponent.
3. **Committa ofta, med tydliga meddelanden** (se avsnitt 5).
4. **Öppna en draft-PR tidigt** när du vill ha feedback på riktningen. En draft kan inte mergas av misstag.
5. **Hämta in senaste `pre-dev` regelbundet**, minst en gång om dagen och alltid innan du ber om review:
   ```
   git fetch
   git merge origin/pre-dev
   ```
   Har `pre-dev` ändrat något grundläggande, som inloggningen, måste din kod anpassas. Det är så de flesta överraskningar i review uppstår.
6. **Kör testerna lokalt** (se avsnitt 4) **och klicka igenom featuren i testläget** (nedan), i mobilbredd och på dator.
7. **Gör PR:en redo** ("Ready for review") mot `pre-dev` och fyll i checklistan. **Nämn en granskare.**

### Testa i testläget

Testläget är appen lokalt med en egen databas och färdig testdata, så att du slipper skapa konton och klicka fram
kontakter, klubbar och brev varje gång. Från `frontend/`:
```
npm run dev:test
```
Det startar backend och frontend (http://localhost:5173). Första gången behöver backend sina paket (`pip install -r
requirements-dev.txt` i `backend/`, i en venv i `backend/.venv`) och frontend `npm install`.

- **Logga in som ...:** startsidan visar testkontona, ett klick och du är inloggad. Bland dem finns ett konto med
  lite av allt, ett med långt namn och långa texter, ett där alla listor är tomma och ett som inte har gjort
  intervjun. Lösenordet för alla är `testlage123` om du vill logga in den vanliga vägen.
- **Testpanelen** (knappen "Testläge" nere till vänster): byt konto, låt något hända (få en kontaktförfrågan, ett brev,
  en klubb- eller eventinbjudan) och börja om med testdatan.
- **På telefonen:** `npm run dev:telefon` startar testläget så att en telefon på samma Wi-Fi når det, och skriver ut
  en QR-kod att skanna. Då testar du den riktiga appen i telefonens webbläsare: pekskärm, tangentbord, zoom och
  adressfält. Alla på samma nätverk når då testkontona, så gör det hemma och inte på ett öppet nät. Frågar Windows
  om brandväggen första gången: tillåt privata nätverk.
- **Snabbkoll av bredd** (i testpanelen): appen i en ram med en telefons eller surfplattas bredd, ovanpå sidan och
  inloggad som samma konto. Bra för att snabbt se layouten, men bara bredden: testa på telefonen innan merge.
- **Databasen** är en SQLite-fil i `backend/.devdata/` som byggs om vid varje start. **Neon rörs aldrig**, och
  testläget vägrar starta mot något annat än SQLite eller på Vercel.
- **AI och mejl är fejkade:** intervjun hittar intressen vars namn står i texten ("jag gillar löpning och schack"),
  och ett intresse som inte finns ("Lägg till ett intresse") godkänns och hamnar under "Övrigt och nischat". Skriv
  **nekas** i ett intresse eller i profiltexten för att se hur appen gör när kontrollen säger nej. Mejl skrivs i
  terminalen i stället för att skickas, så att du kan klicka på länkarna därifrån.
- **Ny AI-funktion?** Testläget svarar på varje AI-anrop efter dess namn (`app/devtools/fake_ai.py`). Ett nytt namn
  ger ett tydligt fel i testläget tills du lägger till ett fejkat svar där.

**Behöver din feature egen testdata?** Lägg till den i `backend/app/devtools/seed.py` (och ett scenario i
`routes.py` om det är något som ska kunna hända på knapptryck) i samma PR, så kan alla testa den direkt. Testdatan
skapas via appens eget API, så den följer samma regler som på riktigt, och `tests/test_devtools.py` säger till om
den slutar fungera.

### En PR per feature

Bygg klart en feature innan du öppnar PR:en, i stället för många små PR:er, så blir det färre pushar och merges (och färre deployer). Håll den ändå till en feature: ju längre en branch lever, desto mer av `pre-dev` missar den och desto svårare blir den att granska. Är något väldigt stort, dela upp det, t.ex. först backend med tester och sedan frontend.

---

## 3. Det vi har kommit överens om

### Inloggning
- Alla routes som rör en användare kräver inloggning: `current_user = Depends(get_current_user)` från `app.auth.security`.
- **Inga fejkade användare** (`FakeUser`, `id = 1` och liknande) i koden som mergas.
- I frontend sköts inloggning av `services/auth.js` och `services/api.js`. Skapa inga egna varianter.
- Man loggar in med **användarnamn eller e-post** i samma fält (`username_or_email`). Med @ är det en e-postadress, därför får användarnamn inte innehålla @.
- **Resten av appen är låst tills profilen är klar.** I backend lägger `require_profile` (från `app.auth.security`) på 403 "Skapa din profil först."; lägg `dependencies=[Depends(require_profile)]` på nya routrar. Öppet utan profil är bara inloggning, `/users/me`, `/profile/...`, `/interests/...` och `/municipalities/`. Vakttestet i `test_require_profile.py` fäller en ny endpoint som glömt låset. I frontend sköts samma sak av `RequireProfile` runt alla sidor utom `/profil`.

### Data om andra användare
- Den inloggade användaren får se allt om sig själv. Andra ser bara det ticketen säger, t.ex. användarnamn, namn, ålder, kommun och bild, aldrig e-post, födelsedatum (visa ålder i stället), kön eller lösenord.
- **Användarnamnet är det publika ID:t** för en person: profilsidan är `/anvandare/{username}` och meddelanden skickas till ett användarnamn. Det får därför finnas med i svar om andra.
- **Blockeringar ska respekteras överallt** där andra användare visas eller kan kontaktas, åt båda hållen. Använd `is_blocked()` i `crud/contact.py`, och svara som om personen inte fanns, så att blockeringen inte avslöjas.
- Skriv ett test som kontrollerar att privata fält **inte** finns i svaret.

### API
- Inga prefix som `/api` på endpoints; följ samma mönster som `/profile/`, `/users/...`, `/interests/`.
- Felmeddelanden till användaren skrivs på **svenska**.
- **Användarnamn syns aldrig i en adress**, varken i sidans adressfält (`/anvandare/12`, inte `/anvandare/anna`) eller i API:t (`/users/12/profile`). Peka ut användare med id, också i request-bodyn (`recipient_id`, `user_ids`). Ett test i `test_app_structure.py` fäller endpoints med användarnamn i adressen.

### Databas och migrationer
- Ändrar du en modell behövs en migration: `alembic revision --autogenerate -m "kort beskrivning"`.
- **Läs igenom migrationsfilen.** Kontrollera att `down_revision` är den senaste befintliga migrationen. CI fäller PR:en om historiken delar sig.
- **Kör inte `alembic upgrade head` innan migrationen har kommit in i `dev`.** Vi delar en Neon-databas (lokalt, dev och produktion), så en migration ändrar databasen för alla direkt. Testa i stället med `pytest`, som använder en egen databas.
- **När `pre-dev` har mergats in i `dev`** kör den som mergade `alembic upgrade head` (från `dev`) och skriver i Discord att det är gjort.

### Intressebiblioteket
- Alla intressen och deras träd (huvudområde › intresse › mer specifikt) står i `backend/app/data/interests.json`. Vill du lägga till, byta namn på eller flytta ett intresse ändrar du där, inte direkt i databasen.
- `slug` är intressets fasta id. Ändra inte en slug som redan finns, då blir det ett nytt intresse. Ett intresse som tas bort ur filen blir inaktivt i databasen, det raderas aldrig (användarnas val finns kvar).
- `pytest` kontrollerar att filen är giltig (unika slugs, föräldrar som finns, inga loopar).
- **När ändringen har kommit in i `dev`**, efter `alembic upgrade head`, kör den som mergade (från `backend/`, på `dev`): `python -m app.sync_interests`. Kör det aldrig från en branch som inte är i `dev`, av samma skäl som migrationerna.

### Miljövariabler
- Ny variabel? Lägg till den i `.env.example` **utan riktigt värde**, skriv i Discord att alla behöver lägga till den lokalt, och lägg in den i Vercel.
- I Vercel: backend-variabler i **backend-projektet**, för både **Preview** och **Production**. Inga citattecken runt värdet. Hemligheter (nycklar, lösenord, `JWT_SECRET`, `DATABASE_URL`) markeras **Sensitive**.
- Nya variabler gäller först efter en **Redeploy**.

### Ersätta befintlig kod
Bygger du något som överlappar befintlig kod: skriv i PR:en vad som ersätts och varför, eller varför båda behövs. Att ta bort kod är aldrig farligt, eftersom den finns kvar i Git-historiken, men det ska synas i PR:en.

### Mobil
De flesta använder appen på telefonen. Vi följer de vanliga riktlinjerna för formulär och knappar på telefon (Apple, Material Design, WCAG 2.2 och Baymards forskning om formulär), och intervjun (`ProfileInterview`) är exemplet att utgå från:
- **Fält har minst 16 px text på pekskärmar**, annars zoomar iPhone in när man trycker i dem. Det sköts globalt i `index.css`, så sätt inte `!important` på en mindre storlek.
- **Knappar och fält är minst 48 px höga** (Material 48 dp, Apple 44 pt, WCAG 2.5.8 minst 24 px), med minst 8 px mellan.
- **En kolumn och etiketten ovanför fältet.** Fält bredvid varandra (`.form-row`) läggs under varandra.
- **Huvudknappen störst och där tummen når**, längst ned eller till höger. På långa sidor ligger den kvar längst ned medan man scrollar.
- **Ett formulär med några få frågor ska gå att fylla i utan att scrolla** på en vanlig telefon (390 × 844, och helst 375 × 667).
- **Rätt tangentbord:** `type`, `autoComplete` och `enterKeyHint` på fälten (t.ex. `autoComplete="name"`, `type="email"`).
- **Stäng aldrig av zoom med två fingrar** (`maximum-scale` eller `user-scalable=no` i viewport-taggen). Det behövs för den som ser dåligt.

Testa på en riktig telefon innan merge (se [testa-pa-mobilen.md](testa-pa-mobilen.md)).

---

## 4. Tester och CI

### Köra testerna lokalt
Från `backend/`, med din venv aktiverad:
```
pip install -r requirements-dev.txt
pytest
```
Testerna använder en tillfällig databas i minnet, och bildtesterna en fejkad bucket. De rör aldrig Neon eller den riktiga bucketen.

### Vad som ska testas
Testa beteendet som spelar roll: huvudflödet och de fel en användare faktiskt kan råka ut för (t.ex. upptaget användarnamn, ogiltig data, något som inte finns, inte inloggad). Varje test ska kontrollera ett riktigt resultat, inte bara köra kod för att höja täckningen. Fixturerna i `tests/conftest.py` ger dig en databas, en testklient och en inloggad användare (`user`).

### Vad CI kontrollerar automatiskt
CI körs på varje PR mot `pre-dev`, `dev` och `main`. Utöver dina tester kontrolleras bland annat att:
- alla routrar är inkopplade i `main.py`
- migrationerna bildar en enda kedja
- frontend bygger utan fel

Täckningsgraden visas i loggen men fäller aldrig bygget.

### Starta om CI eller förstå ett rött kryss
- **Rött kryss:** klicka på "Details" vid checken. Loggen visar vilket test som föll och varför.
- **Köra om:** fliken Actions → välj körningen → "Re-run jobs". En ny push till branchen startar också CI.
- **Står checken på "Expected – waiting"?** Då har CI inte körts för den senaste koden. Hämta in senaste `pre-dev` och pusha, eller använd "Update branch" på PR-sidan.

---

## 5. Commits och pull requests

### Commit-meddelanden
Beskriv **vad** ändringen gör, så att man förstår den om ett halvår.

| Otydligt | Tydligt |
|---|---|
| `pushing up` | `Lägg till endpoint för att blockera en användare` |
| `backend work on profiles` | `Flytta profilfält från users till en egen profiles-tabell` |
| `fix` | `Rätta ålder för den som fyller år på skottdagen` |

Välj ett språk per meddelande och var konsekvent; svenska går bra.

### Pull requests
- PR-beskrivningen är din **överlämning**: vad är gjort, vad återstår, och vad granskaren ska titta extra på. Granskaren kanske läser den mitt i natten när du sover.
- Fyll i checklistan i mallen.
- Länka Jira-ticketen.

### Review
- Review handlar om koden, inte om personen. En kommentar betyder inte att du har gjort fel, utan att två personer ser mer än en.
- Börja gärna med vad som är bra, skilj på "måste fixas" och "förslag", och föreslå en lösning när du kan.
- **Vi granskar inom 24 timmar.** Den som är nämnd som granskare äger det.

---

## 6. Samarbete när vi jobbar på olika tider

Vi jobbar på olika tider, så det mesta behöver fungera utan att vi pratar samtidigt.

- **Kort status i Discord** när du slutar för dagen: vad du gjorde, vad du gör härnäst, vad du är blockerad av.
- **Heads-up när något grundläggande ändras**, t.ex. "pre-dev kräver nu inloggning, använd `get_current_user`" eller "ny miljövariabel: X". Det sparar timmar för andra.
- **Fråga hellre en gång för mycket.** Ett meddelande som "Är det här rätt väg?" är alltid okej.

---

## 7. AI-verktyg

Det är okej att använda AI, och det är också helt okej att låta bli. Det viktiga är att du förstår koden du lämnar in.

- **Lämna aldrig in kod du inte kan förklara.** Fråga hellre AI:n om den rad du inte förstår.
- AI-verktyg läser `AGENTS.md`, så konventionerna där följs automatiskt. Se till att ditt verktyg får läsa den.
- Vill du lära dig: be om förklaringar och ledtrådar i stället för färdig kod, och skriv koden själv.

---

## 8. När du fastnar

- Fastnat i mer än en halvtimme? Skriv i Discord eller be om 15 minuters parprogrammering.
- Osäker på om du är på rätt väg? Öppna en draft-PR och be om en snabb titt.
- Hittar du något i den här guiden som är fel eller oklart? Ändra den i en PR. Guiden ska alltid stämma med koden.
