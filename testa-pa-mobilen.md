# Testa appen på mobilen hemma

> **Enklast: testläget.** `npm run dev:telefon` i `frontend/` gör allt nedan åt dig (adresser, CORS och en QR-kod att
> skanna) och kör mot testlägets egen databas i stället för Neon, med färdiga testkonton. Se "Testa i testläget" i
> [CONTRIBUTING.md](CONTRIBUTING.md). Stegen nedan behövs bara om du vill testa mot den riktiga databasen.

Feature-branches och `pre-dev` deployas inte längre (se `CONTRIBUTING.md`), så vill du se din branch på mobilen kör du appen på datorn och öppnar den från mobilen över ert Wi-Fi. Det tar ett par minuter att ställa in första gången.

```
Mobilen ──Wi-Fi──▶ datorn:5173 (frontend, Vite)
                     └▶ datorn:8000 (backend, uvicorn) ──▶ Neon
```

Utgå från att appen redan fungerar lokalt på datorn (se `backend/README.md` och `frontend/README.md`).

> **Obs:** backend använder samma Neon-databas som dev och produktion. Det du gör från mobilen (skapar klubbar, skickar brev) händer på riktigt, precis som när du kör lokalt på datorn.

---

## 1. Hitta datorns IP-adress

Mobilen når inte datorn via `localhost` (för mobilen är "localhost" mobilen själv). Den behöver datorns adress i ert nätverk.

- **Windows:** kör `ipconfig` och leta upp **IPv4-adress** under Wi-Fi-kortet (eller Ethernet om datorn sitter i kabel).
- **Mac:** `ipconfig getifaddr en0`
- **Linux:** `hostname -I`

Adressen ser ut ungefär som `192.168.0.34` eller `10.0.0.12`. Nedan står `<IP>`, byt ut det mot din.

## 2. Starta backend så att den nås från nätverket

Från `backend/`, med din venv aktiverad. `--host 0.0.0.0` gör att den lyssnar på hela nätverket och inte bara på datorn, och `CORS_ORIGINS` måste också innehålla adressen som mobilen öppnar frontend på.

**Windows (PowerShell):**
```powershell
$env:CORS_ORIGINS = "http://localhost:5173,http://<IP>:5173"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Mac/Linux:**
```bash
CORS_ORIGINS="http://localhost:5173,http://<IP>:5173" uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

En miljövariabel som sätts så här vinner över `backend/.env`, så du behöver inte ändra i `.env`. Den gäller bara för det terminalfönstret.

## 3. Starta frontend så att den nås från nätverket

Från `frontend/`. `VITE_API_URL` måste peka på datorns IP, annars försöker mobilen prata med en backend på sig själv. `--host` gör att Vite lyssnar på hela nätverket.

**Windows (PowerShell):**
```powershell
$env:VITE_API_URL = "http://<IP>:8000"
npm run dev -- --host
```

**Mac/Linux:**
```bash
VITE_API_URL=http://<IP>:8000 npm run dev -- --host
```

Även här vinner miljövariabeln över `frontend/.env`. Vite skriver ut en rad med `Network: http://<IP>:5173/` när den har startat.

## 4. Släpp igenom brandväggen (Windows, första gången)

- Första gången backend och frontend startar frågar Windows om Python och Node får ta emot anslutningar. Välj **Privata nätverk** och tryck **Tillåt**.
- Ditt Wi-Fi måste vara inställt som **privat** nätverk: Inställningar → Nätverk och Internet → Wi-Fi → ditt nätverk → Nätverksprofil: **Privat**. Är det "Offentligt" blockerar Windows anslutningarna.
- Missade du frågan, eller blockeras det ändå? Kör i en PowerShell **som administratör**:
  ```powershell
  New-NetFirewallRule -DisplayName "IntresseKlubben dev" -Direction Inbound -Protocol TCP -LocalPort 5173,8000 -Action Allow -Profile Private
  ```
  Regeln gäller bara privata nätverk och bara de två portarna. Ta bort den med `Remove-NetFirewallRule -DisplayName "IntresseKlubben dev"`.

På Mac frågar systemet på samma sätt om Python och Node får ta emot inkommande anslutningar. Svara **Tillåt**.

## 5. Öppna appen på mobilen

1. Se till att mobilen är på **samma Wi-Fi** som datorn (inte mobildata, inte ett gästnätverk).
2. Öppna `http://<IP>:5173` i mobilens webbläsare.
3. Logga in som vanligt.

Ändringar du sparar i koden syns direkt på mobilen, precis som på datorn.

---

## Felsökning

| Problem | Troligen | Gör så här |
|---|---|---|
| Sidan laddar inte alls på mobilen | Brandväggen, fel nätverk eller fel IP | Kolla steg 4 och att mobilen är på samma Wi-Fi. Kör `ipconfig` igen, adressen kan ha ändrats sedan sist. |
| Sidan laddar, men inloggningen säger att servern inte svarar | `VITE_API_URL` pekar på `localhost`, eller backend lyssnar bara på datorn | Starta om frontend med rätt `VITE_API_URL` (steg 3) och backend med `--host 0.0.0.0` (steg 2). |
| Felet nämner CORS i konsolen, eller inloggningen misslyckas utan förklaring | `CORS_ORIGINS` saknar `http://<IP>:5173` | Starta om backend med rätt `CORS_ORIGINS` (steg 2). |
| Vill testa backend direkt | | Öppna `http://<IP>:8000/docs` på mobilen. Syns sidan når mobilen backend. |
| Skolans eller kaféets Wi-Fi | Sådana nätverk stänger ofta av trafik mellan enheter | Slå på **hotspot** på mobilen och anslut datorn till den. Kör `ipconfig` igen, adressen blir en annan. |

## Säkerhet

- **Öppna aldrig portar i routern** (port forwarding). Då blir din dator och den delade databasen nåbar från hela internet. Allt i den här guiden fungerar bara inom ert eget nätverk.
- Gör det bara på **nätverk du litar på**, hemma eller via din egen hotspot. På ett öppet nätverk kan andra på samma nät också nå appen på din dator.
- Stäng backend och frontend (Ctrl+C) när du är klar.
