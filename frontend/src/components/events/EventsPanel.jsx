import { useState } from 'react'

const TABS = [
  { id: 'mine', label: 'Mina events' },
  { id: 'invitations', label: 'Inbjudningar' },
  { id: 'suggested', label: 'Förslag' },
]

const EMPTY_TEXT = {
  mine: 'Du har inga events ännu.',
  invitations: 'Du har inga inbjudningar just nu.',
  suggested: 'Inga förslag just nu. Lägg till fler intressen på din profil för att få fler.',
}

// Allt innehåll för events. Byggd på samma sätt som GroupsPanel: ett kort med
// rubrik och en rund plusknapp, flikar under och en lista per flik.
// titleTag är h1 på den egna sidan och kan vara h2 om panelen senare visas i
// ett fönster.
// Än så länge finns ingen backend för events, så listorna är tomma och
// plusknappen visar bara en plats för formuläret som kommer i ett eget steg.
function EventsPanel({ titleTag: Title = 'h2' }) {
  const [tab, setTab] = useState('mine')
  // 'list' eller 'create'.
  const [view, setView] = useState('list')
  const lists = { mine: [], invitations: [], suggested: [] }

  return (
    <section className="card card-wide groups-panel">
      <div className="groups-panel-header">
        <Title className="groups-panel-title">Events</Title>
        {view !== 'create' && (
          <button
            type="button"
            className="primary-button round-button"
            aria-label="Skapa event"
            onClick={() => setView('create')}
          />
        )}
      </div>

      {view === 'create' ? (
        <div className="auth-form groups-form">
          <h2>Skapa event</h2>
          <p className="hint-text">Formuläret kommer i nästa steg.</p>
          <button type="button" className="button-secondary" onClick={() => setView('list')}>
            Avbryt
          </button>
        </div>
      ) : (
        <>
          <div className="groups-panel-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tag${tab === t.id ? ' tag-selected' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label} ({lists[t.id].length})
              </button>
            ))}
          </div>

          <p className="hint-text">{EMPTY_TEXT[tab]}</p>
        </>
      )}
    </section>
  )
}

export default EventsPanel
