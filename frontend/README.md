# Frontend – Intresseklubben

React + Vite. Kör lokalt:

```
npm install
cp .env.example .env
npm run dev
```

## Stilguide

Innan du stylear något nytt, kolla `/stilguide` (`npm run dev` och gå till
`localhost:5173/stilguide`) och `src/styles/index.css`. Allt nedan är redan
definierat där, används via CSS-variabler och klasser istället för att hitta
på nya hex-koder eller pixelvärden.

| Typ | Namn | Exempel på användning |
|---|---|---|
| Färger | `--color-bg`, `--color-text`, `--color-accent`, `--color-line`, `--color-white`, `--color-muted` | `background: var(--color-accent);` |
| Typsnitt | `--font-heading` (Caveat), `--font-body` (Inter) | `font-family: var(--font-heading);` |
| Textstorlekar | `--text-hero`, `--text-h1`, `--text-card-title`, `--text-h2`, `--text-subheading`, `--text-body`, `--text-small` | `font-size: var(--text-body);` |
| Knappar | `.primary-button`, `.account-choice-link`, `.button-small` och `.button-large` (kombineras med de andra två) | `<button className="primary-button button-small">` |
| Boxar | `.card`, `.card-avatar`, `.card-title`, `.card-subheading`, `.card-text` | Se Boxar-exemplet i stilguiden |
| Profilbild | `Avatar` (bild, annars initial) med `.person-list-avatar` (liten) eller `.card-avatar` (stor) | `<Avatar name={user.name} imageUrl={user.image_url} className="person-list-avatar" />` |
| Maskot | `Intressekompis` (pupiller som följer muspekaren). Storleken ges med `width` eller förälderns bredd; `alt=""` när den bara pryder | `<Intressekompis width="200px" />` |
| Formulär | `.auth-form`, dess `input`/`label`/`button` | Se Formulärfält-exemplet i stilguiden |
| Plats på kartan | `LocationPicker` (sök adressen och sätt en nål på en liten karta), för events och klubbarnas träffplats | `<LocationPicker id="event-position" queries={[address, placeName]} value={position} onChange={setPosition} saveLabel="Skapa event" kommunCode={kod} />` |
| Länkar | `.info-link` (fungerar även på en `<button>`, t.ex. något som fälls ut) | `<a className="info-link">` |
| Brev | `.envelopes` + `ConversationCard` (kuvert), `.lined-paper` (linjerat papper), `.notepad` (konversationen) | Se Brev-exemplet i stilguiden |
| Rubriker | Vanliga `<h1>`/`<h2>`-taggar, redan stylade automatiskt | `<h2>Min rubrik</h2>` |

Behöver ni något nytt (en ny färg, en ny komponenttyp), lägg till den i
`index.css` **och** i `src/pages/StyleGuide.jsx`, så den syns för alla.

## Deploy (Vercel)

Frontend deployas som ett eget Vercel-projekt, separat från backend:

1. Skapa ett nytt Vercel-projekt från repot och sätt **Root Directory** till `frontend`. Vite känns igen automatiskt (build-kommando `npm run build`, output `dist`).
2. Sätt miljövariabeln `VITE_API_URL` till backendens Vercel-URL (t.ex. `https://intresseklubben-backend.vercel.app`).
3. `vercel.json` i den här mappen lägger till en rewrite till `index.html` så att client-side routing (`react-router-dom`) fungerar på direktlänkar/refresh.
