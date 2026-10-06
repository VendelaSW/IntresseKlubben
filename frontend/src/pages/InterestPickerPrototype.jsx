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
const keyOf = (category, sub) => `${category}/${sub}`

// Sökningen bryr sig inte om stora/små bokstäver eller mellanslag runt texten.
const normalize = (text) => text.normalize('NFC').trim().toLocaleLowerCase('sv')

function InterestPickerPrototype() {
  // Valda underintressen: nyckel -> fritext (tom sträng om ingen fritext).
  const [selected, setSelected] = useState(new Map())
  const [open, setOpen] = useState(new Set())
  const [query, setQuery] = useState('')

  function toggle(category, sub) {
    const key = keyOf(category, sub)
    const next = new Map(selected)
    if (next.has(key)) next.delete(key)
    else next.set(key, '')
    setSelected(next)
  }

  function setFreetext(key, text) {
    setSelected(new Map(selected).set(key, text))
  }

  function toggleOpen(category) {
    const next = new Set(open)
    if (next.has(category)) next.delete(category)
    else next.add(category)
    setOpen(next)
  }

  const search = normalize(query)
  // Vid sökning: underintressen vars namn (eller huvudintresse) innehåller
  // söktexten, och de kategorierna visas utfällda.
  const visible = CATEGORIES.map((category) => ({
    ...category,
    subinterests: search
      ? category.subinterests.filter(
          (sub) => normalize(sub).includes(search) || normalize(category.name).includes(search),
        )
      : category.subinterests,
  })).filter((category) => category.subinterests.length > 0)

  return (
    <main className="app-main">
      <section className="app-section interest-picker">
        <h1 className="app-title">Mina intressen</h1>
        <p className="hint-text">
          Prototyp: inget sparas. Välj underintressen, och skriv gärna något mer specifikt under dem.
        </p>

        <div className="interest-picker-chosen">
          <h2>Valda ({selected.size})</h2>
          {selected.size === 0 ? (
            <p className="hint-text">Inga intressen valda än.</p>
          ) : (
            <ul className="tags">
              {[...selected.keys()].map((key, _, keys) => {
                const [category, sub] = key.split('/')
                // Visa huvudintresset bara när två valda heter likadant (t.ex. Fantasy).
                const twin = keys.some((other) => other !== key && other.split('/')[1] === sub)
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="tag tag-selected"
                      aria-label={`Ta bort ${sub} (${category})`}
                      onClick={() => toggle(category, sub)}
                    >
                      {twin ? `${sub} (${category})` : sub} <span aria-hidden="true">×</span>
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

        {visible.length === 0 && <p className="hint-text">Inget intresse matchar "{query.trim()}".</p>}

        <ul className="interest-picker-categories">
          {visible.map((category, categoryIndex) => {
            const isOpen = search !== '' || open.has(category.name)
            const chosenHere = [...selected.keys()].filter((key) => key.startsWith(`${category.name}/`))
            const panelId = `interest-category-${categoryIndex}`
            return (
              <li key={category.name} className="interest-category">
                <button
                  type="button"
                  className="interest-category-header"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleOpen(category.name)}
                >
                  <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  {category.name}
                  {chosenHere.length > 0 && <span className="hint-text">{chosenHere.length} valda</span>}
                </button>

                {isOpen && (
                  <div id={panelId} className="interest-category-body">
                    <ul className="tags">
                      {category.subinterests.map((sub) => {
                        const isSelected = selected.has(keyOf(category.name, sub))
                        return (
                          <li key={sub}>
                            <button
                              type="button"
                              className={`tag${isSelected ? ' tag-selected' : ''}`}
                              aria-pressed={isSelected}
                              onClick={() => toggle(category.name, sub)}
                            >
                              {sub}
                            </button>
                          </li>
                        )
                      })}
                    </ul>

                    {chosenHere.map((key, i) => {
                      const sub = key.split('/')[1]
                      const inputId = `${panelId}-freetext-${i}`
                      return (
                        <div key={key} className="interest-freetext">
                          <label htmlFor={inputId}>{sub}: något specifikt? (valfritt)</label>
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
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}

export default InterestPickerPrototype
