# Prototyp: AI-matchning på intressen

Testar hur vänförslagen kan bli bättre än dagens matchning, innan något byggs in
i appen. Rör inte appen eller databasen.

## Slutsats hittills

1. **Intresseträdet gör mest nytta.** Med huvud- och underintressen får även den
   som inte delar något exakt intresse med någon vettiga förslag ("Ni gillar
   båda musik").
2. **AI-likhet medan appen körs (embeddings) håller inte.** Modellen ger nästan
   alla par en likhet mellan 0,85 och 0,95, och bra par (Klättring–Bouldering)
   blandas med brus (Kajak–Öl och vin, Bakning–Programmering). Det blev inte
   bättre med den större modellen eller med beskrivningar av intressena.
3. **Variant A fungerar bäst:** AI föreslår *i förväg* vilka underintressen som
   hör ihop (`related.json`), människor granskar, och matchningen använder bara
   den listan. Förutsägbart, lätt att förklara och gratis när appen körs.
4. **Fritext ska höra till ett underintresse**, t.ex. "Ghost" under Metal och
   "Elden Ring" under Rollspel. Användaren väljer själv, så det blir aldrig
   fel, och samma fritext ger extra poäng ("Ni gillar båda Ghost"). Att låta
   AI gissa underintresse (`--fritext`) fungerade bara för text som beskriver
   något (Arduino → Programmering), inte för namn modellen inte känner till
   (Ghost → Keramik, Zelda → Kortspel, Catan → Katter). Det skulle kräva en
   språkmodell som kan saker om världen, och kan bli ett eget steg senare.

## Fritext i appen

- **Normalisera innan jämförelse:** ta bort mellanslag i början och slutet,
  slå ihop dubbla mellanslag, gör om till små bokstäver (`casefold`) och
  Unicode-normalisera (NFC, så att "å" alltid lagras likadant). Spara den
  normaliserade texten i en egen kolumn med index per underintresse, som
  `lower(username)` för användarnamn. Se `normalize_freetext()` i `match.py`.
- **Olika stavningar** ("Zelda" och "The Legend of Zelda", "D&D" och
  "Dungeons & Dragons") löses inte av normaliseringen. Bäst är
  autokomplettering: den som skriver "gho" under Metal får förslaget "Ghost",
  som andra redan skrivit.

## Filer

- **`interests.json`**: utkast till intresseträd (huvudintressen,
  underintressen, korta beskrivningar och exempel på fritext), framtaget med AI.
  Gå igenom och ändra. Längst ner står var dagens 19 intressen hamnar.
- **`related.json`**: utkast, framtaget med AI: vilka underintressen som hör
  ihop. Gäller åt båda hållen. Gå igenom och ändra.
- **`fake_users.json`**: ett 30-tal påhittade användare. Några är medvetet
  nästan lika utan att ha exakt samma intresse, t.ex. klättring och bouldering.
- **`match.py`**: visar förslag sida vid sida, med en förklaring för varje:
  - **Dagens:** antal exakt samma intressen.
  - **A: Kopplingar:** 3 p för samma underintresse eller fritext, 2 p för
    intressen som hör ihop enligt `related.json` och 1 p för samma
    huvudintresse.
  - **AI (med `--ai`):** som A, men "hör ihop" avgörs av AI-likhet i stället
    för `related.json`.

## Köra

Inga extra paket behövs. Från `backend/`:

```
python prototypes/ai_matching/match.py                 # några utvalda användare
python prototypes/ai_matching/match.py klatter_kalle   # en viss användare
python prototypes/ai_matching/match.py --alla          # alla användare
```

Det här behöver ingen AI och ingen token.

### AI-delarna

Kräver en Hugging Face-token (typ **Read**, skapas under Settings → Access
Tokens på huggingface.co). Lägg aldrig in token i en fil.

```
export HF_TOKEN="din-token"           # Git Bash
$env:HF_TOKEN = "din-token"           # PowerShell (i stället för raden ovan)
```

- `--fritext`: AI-förslag på underintresse för fritexten (fungerade dåligt, se ovan)
- `--ai`: visa även AI-varianten bredvid A
- `--modell large`: den större modellen (`multilingual-e5-large`) i stället för den lilla
- `--jamfor`: båda modellerna sida vid sida
- `--par`: de mest lika paren enligt AI, och var gränsen för "liknar varandra"
  hamnar (✓ = över gränsen). `--par Klättring` visar bara par med ett visst intresse.
- `--korta`: skicka bara intressenas namn till modellen, i stället för beskrivningarna

Valen går att kombinera, t.ex. `--jamfor --par Metal`. Vektorerna från Hugging
Face sparas i `embeddings_cache.json` (ignoreras av git), så API:t anropas bara
för nya texter.

## Vad man ska titta efter

- Stämmer kopplingarna i `related.json`? Saknas någon, eller finns det någon
  som inte borde finnas?
- Är förklaringarna begripliga för en användare?
- Är det rätt att fritext alltid hör till ett underintresse?
