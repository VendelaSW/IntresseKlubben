import { useCallback, useEffect, useState } from 'react'
import CreateEventForm from './CreateEventForm'
import EventList from './EventList'
import { getEvents } from '../../services/events'
import { getMyGroups } from '../../services/groups'
import { getAllInterests, getMyInterests } from '../../services/interests'

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

// Delar upp alla events man får se i flikarna:
// - Mina events: ens egna, och de man har svarat Ja eller Kanske på.
// - Inbjudningar: de man är inbjuden till och inte har svarat på än.
// - Förslag: övriga (öppna och klubbarnas events), där man varken har skapat,
//   blivit inbjuden eller svarat.
function splitEvents(events) {
  const lists = { mine: [], invitations: [], suggested: [] }
  for (const event of events) {
    const answeredYesOrMaybe = event.my_answer === 'yes' || event.my_answer === 'maybe'
    if (event.is_owner || answeredYesOrMaybe) lists.mine.push(event)
    else if (event.is_invited && event.my_answer === null) lists.invitations.push(event)
    else if (!event.is_invited && event.my_answer === null) lists.suggested.push(event)
  }
  return lists
}

// Allt innehåll för events. Byggd på samma sätt som GroupsPanel: en egen
// <section className="app-section"> (som Klubbar och Personer) med rubrik och
// en rund plusknapp, flikar under och en lista per flik.
function EventsPanel() {
  // Status för det formuläret behöver (intressen, klubbar). Misslyckas hämtningen
  // av själva events visas ett fel i listan, men rubriken och formuläret finns kvar.
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [eventsFailed, setEventsFailed] = useState(false)
  const [tab, setTab] = useState('mine')
  // 'list' eller 'create'.
  const [view, setView] = useState('list')
  const [lists, setLists] = useState({ mine: [], invitations: [], suggested: [] })
  const [interests, setInterests] = useState([])
  const [myGroups, setMyGroups] = useState([])
  const [myInterestIds, setMyInterestIds] = useState(new Set())

  const loadEvents = useCallback(
    () =>
      getEvents()
        .then((events) => {
          setLists(splitEvents(events))
          setEventsFailed(false)
        })
        .catch(() => setEventsFailed(true)),
    [],
  )

  useEffect(() => {
    Promise.all([getAllInterests(), getMyGroups(), getMyInterests(), loadEvents()])
      .then(([allInterests, groups, mine]) => {
        setInterests(allInterests)
        setMyGroups(groups)
        setMyInterestIds(new Set(mine.map((i) => i.id)))
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [loadEvents])

  async function handleCreated() {
    setTab('mine')
    setView('list')
    await loadEvents()
  }

  return (
    <section className="app-section app-section-centered">
      <div className="page-header">
        <h1 className="app-title">Events</h1>
        {view !== 'create' && (
          <button
            type="button"
            className="primary-button round-button"
            aria-label="Skapa event"
            onClick={() => setView('create')}
          />
        )}
      </div>

      {status === 'loading' ? (
        <p className="hint-text">Laddar events...</p>
      ) : status === 'error' ? (
        <p className="status-error">Kunde inte hämta sidan. Försök igen senare.</p>
      ) : view === 'create' ? (
        <div className="card sheet">
          <CreateEventForm
            interests={interests}
            groups={myGroups}
            onCreated={handleCreated}
            onCancel={() => setView('list')}
          />
        </div>
      ) : (
        <>
          <div className="filter-tabs" role="tablist">
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

          {eventsFailed ? (
            <p className="status-error">Kunde inte hämta events. Försök igen senare.</p>
          ) : (
            <EventList events={lists[tab]} emptyText={EMPTY_TEXT[tab]} myInterestIds={myInterestIds} />
          )}
        </>
      )}
    </section>
  )
}

export default EventsPanel
