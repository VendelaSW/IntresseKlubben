import { useState } from 'react'

// PROTOTYP: att välja intressen ur ett intresseträd (huvudintresse ->
// underintressen), med sök och fritext under valda underintressen. Inget
// sparas och backend rörs inte. Datan är kopierad från utkastet i
// backend/prototypes/ai_matching/interests.json (branchen
// feat/ai-matching-prototype); i den riktiga versionen kommer den från API:t.
const CATEGORIES = [
  {
    name: 'Musik',
    subinterests: ['Pop', 'Rock', 'Metal', 'Punk', 'Hiphop', 'Jazz', 'Klassisk musik', 'Elektronisk musik', 'Visor och folkmusik', 'Spela instrument', 'Sjunga i kör', 'Konserter och festivaler'],
  },
  {
    name: 'Tv-spel',
    subinterests: ['Rollspel (RPG)', 'Open world', 'Action', 'Strategi', 'Skräckspel', 'Sport- och racingspel', 'Mysiga spel', 'Pusselspel', 'E-sport', 'Retrospel'],
  },
  {
    name: 'Film och tv',
    subinterests: ['Skräck', 'Komedi', 'Science fiction', 'Fantasy', 'Dokumentär', 'Anime', 'Drama', 'Deckare'],
  },
  {
    name: 'Böcker',
    subinterests: ['Bokcirkel', 'Deckare och thrillers', 'Fantasy', 'Science fiction', 'Romance', 'Historia', 'Poesi', 'Serier och manga'],
  },
  {
    name: 'Sport och träning',
    subinterests: ['Löpning', 'Fotboll', 'Gym', 'Yoga', 'Simning', 'Cykling', 'Padel', 'Kampsport', 'Innebandy'],
  },
  {
    name: 'Friluftsliv',
    subinterests: ['Vandring', 'Klättring', 'Bouldering', 'Kajak och kanot', 'Fiske', 'Camping', 'Svamp- och bärplockning', 'Dykning'],
  },
  {
    name: 'Spel och pussel',
    subinterests: ['Brädspel', 'Bordsrollspel', 'Kortspel', 'Schack', 'Pussel', 'Quiz'],
  },
  {
    name: 'Skapande',
    subinterests: ['Måla och teckna', 'Keramik', 'Stickning och virkning', 'Sömnad', 'Fotografering', 'Skrivande', 'Snickeri'],
  },
  {
    name: 'Mat och dryck',
    subinterests: ['Matlagning', 'Bakning', 'Vegetariskt', 'Öl och vin', 'Fika'],
  },
  {
    name: 'Djur och natur',
    subinterests: ['Katter', 'Hundar', 'Hästar', 'Fågelskådning', 'Trädgård'],
  },
  {
    name: 'Dans',
    subinterests: ['Salsa', 'Bugg', 'Lindy hop', 'Hiphopdans', 'Balett'],
  },
  {
    name: 'Teknik',
    subinterests: ['Programmering', 'Elektronik', 'AI', '3D-utskrift'],
  },
  {
    name: 'Kultur och samhälle',
    subinterests: ['Teater', 'Museer och konst', 'Historia', 'Språk', 'Resor', 'Volontärarbete'],
  },
]

// Exempel i fritextfältet för några underintressen. Övriga får en allmän text.
const EXAMPLES = {
  'Musik/Metal': 'Ghost, Spiritbox',
  'Musik/Pop': 'Taylor Swift, Veronica Maggio',
  'Musik/Spela instrument': 'gitarr, piano',
  'Tv-spel/Rollspel (RPG)': 'Elden Ring, Zelda',
  'Tv-spel/Mysiga spel': 'Stardew Valley, Animal Crossing',
  'Tv-spel/E-sport': 'Counter-Strike, League of Legends',
  'Film och tv/Fantasy': 'Sagan om ringen',
  'Film och tv/Anime': 'Studio Ghibli',
  'Böcker/Fantasy': 'Harry Potter, Tolkien',
  'Böcker/Deckare och thrillers': 'Camilla Läckberg',
  'Sport och träning/Löpning': 'Stockholm Marathon',
  'Sport och träning/Fotboll': 'Hammarby, AIK',
  'Friluftsliv/Vandring': 'Kungsleden, Sörmlandsleden',
  'Friluftsliv/Klättring': 'inomhus, sportklättring',
  'Spel och pussel/Bordsrollspel': 'Dungeons & Dragons',
  'Spel och pussel/Brädspel': 'Catan, Ticket to Ride',
  'Skapande/Måla och teckna': 'akvarell, olja',
  'Skapande/Keramik': 'drejning',
  'Mat och dryck/Bakning': 'surdeg, kakor',
  'Djur och natur/Katter': 'Maine coon',
  'Teknik/Programmering': 'Python, webbappar',
  'Kultur och samhälle/Språk': 'japanska, spanska',
  'Kultur och samhälle/Resor': 'Interrail, Japan',
}

// Ett underintresse identifieras av "Huvudintresse/Underintresse", eftersom
// samma namn kan finnas under flera (t.ex. Fantasy under både Film och Böcker).
// Huvudintresset självt (t.ex. bara "Musik") har bara namnet som nyckel.
const keyOf = (category, sub = null) => (sub ? `${category}/${sub}` : category)
const categoryOf = (key) => key.split('/')[0]
// Namnet som visas: underintresset, eller huvudintresset om det är det som valts.
const nameOf = (key) => key.split('/')[1] ?? key
const isMain = (key) => !key.includes('/')

// Sökningen bryr sig inte om stora/små bokstäver eller mellanslag runt texten.
const normalize = (text) => text.normalize('NFC').trim().toLocaleLowerCase('sv')

function InterestPickerPrototype() {
  // Valda intressen (huvudintressen och underintressen): nyckel -> fritext
  // (tom sträng om ingen fritext).
  const [selected, setSelected] = useState(new Map())
  // Huvudintresset vars underkategorier visas, eller null. Bara ett åt gången.
  const [openCategory, setOpenCategory] = useState(null)
  const [query, setQuery] = useState('')

  function toggle(key) {
    const next = new Map(selected)
    if (next.has(key)) next.delete(key)
    else next.set(key, '')
    setSelected(next)
  }

  function setFreetext(key, text) {
    setSelected(new Map(selected).set(key, text))
  }

  const search = normalize(query)
  // Vid sökning: huvudintressen vars namn, eller något underintresse, innehåller
  // söktexten. Matchar bara underintressen visas bara de i rutan.
  const visible = CATEGORIES.map((category) => {
    const mainMatches = !search || normalize(category.name).includes(search)
    return {
      ...category,
      showMain: mainMatches,
      subinterests: mainMatches
        ? category.subinterests
        : category.subinterests.filter((sub) => normalize(sub).includes(search)),
    }
  }).filter((category) => category.showMain || category.subinterests.length > 0)

  // Den öppna kategorin, om den syns med nuvarande sökning. Ger sökningen bara
  // en enda kategori öppnas den direkt.
  const open =
    visible.find((category) => category.name === openCategory) ?? (search && visible.length === 1 ? visible[0] : null)
  const countIn = (name) => [...selected.keys()].filter((key) => categoryOf(key) === name).length

  return (
    <main className="app-main">
      <section className="app-section interest-picker">
        <h1 className="app-title">Mina intressen</h1>
        <p className="hint-text">
          Prototyp: inget sparas. Klicka på ett område för att se underkategorierna. Välj hela området (t.ex. Musik i
          allmänhet) eller underkategorier, och skriv gärna något mer specifikt.
        </p>

        <div className="interest-picker-chosen">
          <h2>Valda ({selected.size})</h2>
          {selected.size === 0 ? (
            <p className="hint-text">Inga intressen valda än.</p>
          ) : (
            <ul className="tags">
              {[...selected.keys()].map((key, _, keys) => {
                const name = nameOf(key)
                // Visa huvudintresset bara när två valda heter likadant (t.ex. Fantasy).
                const twin = !isMain(key) && keys.some((other) => other !== key && nameOf(other) === name)
                const label = twin ? `${name} (${categoryOf(key)})` : name
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="tag tag-selected"
                      aria-label={`Ta bort ${label}`}
                      onClick={() => toggle(key)}
                    >
                      {label} <span aria-hidden="true">×</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <input
          type="search"
          className="interest-picker-search"
          placeholder="Sök intresse, t.ex. klättring"
          aria-label="Sök intresse"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {visible.length === 0 ? (
          <p className="hint-text">Inget intresse matchar "{query.trim()}".</p>
        ) : (
          <>
            {/* Huvudintressena som taggar. Den öppna har gul kant, och antalet
                valda inom ett område står efter namnet. */}
            <ul className="tags">
              {visible.map((category) => {
                const isOpen = open?.name === category.name
                const count = countIn(category.name)
                return (
                  <li key={category.name}>
                    <button
                      type="button"
                      className={`tag interest-area${isOpen ? ' interest-area-open' : ''}`}
                      aria-expanded={isOpen}
                      aria-controls="interest-panel"
                      onClick={() => setOpenCategory(isOpen ? null : category.name)}
                    >
                      {category.name}
                      {count > 0 && <span className="interest-area-count">{count}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>

            {open && (
              <div id="interest-panel" className="card interest-panel">
                <h2>{open.name}</h2>
                <ul className="tags">
                  {[
                    // Hela området, för den som inte vill välja underkategorier.
                    ...(open.showMain ? [{ key: keyOf(open.name), label: `${open.name} i allmänhet` }] : []),
                    ...open.subinterests.map((sub) => ({ key: keyOf(open.name, sub), label: sub })),
                  ].map(({ key, label }) => {
                    const isSelected = selected.has(key)
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          className={`tag${isSelected ? ' tag-selected' : ''}`}
                          aria-pressed={isSelected}
                          onClick={() => toggle(key)}
                        >
                          {label}
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {/* Fritext för det man valt inom området: huvudintresset först. */}
                {[...selected.keys()]
                  .filter((key) => categoryOf(key) === open.name)
                  .sort((a, b) => Number(isMain(b)) - Number(isMain(a)))
                  .map((key, i) => {
                    const inputId = `interest-freetext-${i}`
                    return (
                      <div key={key} className="interest-freetext">
                        <label htmlFor={inputId}>{nameOf(key)}: något specifikt? (valfritt)</label>
                        <input
                          id={inputId}
                          type="text"
                          maxLength={100}
                          placeholder={EXAMPLES[key] ? `t.ex. ${EXAMPLES[key]}` : 'Skriv något mer specifikt'}
                          value={selected.get(key)}
                          onChange={(e) => setFreetext(key, e.target.value)}
                        />
                      </div>
                    )
                  })}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default InterestPickerPrototype
