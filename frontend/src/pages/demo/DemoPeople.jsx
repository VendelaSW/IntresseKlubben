import { useState } from 'react'
import { PersonCard } from '../../components/DemoCards'
import { matchPeople, useDemo } from '../../hooks/useDemo'

const FILTERS = [
  { key: 'suggested', label: 'Förslag' },
  { key: 'requests', label: 'Förfrågningar' },
  { key: 'contacts', label: 'Kontakter' },
]

function DemoPeople() {
  const { profile, relations } = useDemo()
  const [filter, setFilter] = useState('suggested')
  const people = matchPeople(profile)

  const lists = {
    suggested: people.filter((p) => !relations[p.id] || relations[p.id] === 'sent'),
    requests: people.filter((p) => relations[p.id] === 'incoming'),
    contacts: people.filter((p) => relations[p.id] === 'contact'),
  }
  const shown = lists[filter]

  const empty = {
    suggested: 'Du har redan kontakt med alla förslag. Snyggt!',
    requests: 'Inga förfrågningar att svara på.',
    contacts: 'Inga kontakter än. Skicka en förfrågan till någon under Förslag.',
  }

  return (
    <section className="app-section">
      <h1 className="app-title">Personer</h1>
      <div className="filter-tabs" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`tag${filter === f.key ? ' tag-selected' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({lists[f.key].length})
          </button>
        ))}
      </div>
      {filter === 'suggested' && (
        <p className="hint-text">Sorterat efter flest gemensamma intressen, sedan avstånd.</p>
      )}
      {shown.length > 0 ? (
        <div className="card-grid">
          {shown.map((person) => (
            <PersonCard key={person.id} person={person} shared={person.shared} />
          ))}
        </div>
      ) : (
        <p className="hint-text">{empty[filter]}</p>
      )}
    </section>
  )
}

export default DemoPeople
