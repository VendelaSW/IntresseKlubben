import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGoBack } from '../../hooks/useCanGoBack'
import CreateEventForm from './CreateEventForm'
import BackButton from '../BackButton'
import EventDetails from './EventDetails'
import EventList from './EventList'
import { contactsQuery } from '../../services/contacts'
import { eventsQuery } from '../../services/events'
import { myGroupsQuery } from '../../services/groups'
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
// - Inbjudningar: de man är inbjuden till och inte har svarat på än. Under dem
//   ligger en egen lista, Nekade, med de man har svarat Nej på (inbjuden eller
//   inte), så att de går att hitta igen.
// - Förslag: övriga (öppna och klubbarnas events), där man varken har skapat,
//   blivit inbjuden eller svarat.
function splitEvents(events) {
  const lists = { mine: [], invitations: [], suggested: [], declined: [] }
  for (const event of events) {
    const answeredYesOrMaybe = event.my_answer === 'yes' || event.my_answer === 'maybe'
    // Ens eget event ligger alltid under Mina events, även om man svarar Nej.
    if (event.is_owner || answeredYesOrMaybe) lists.mine.push(event)
    else if (event.my_answer === 'no') lists.declined.push(event)
    else if (event.is_invited && event.my_answer === null) lists.invitations.push(event)
    else if (!event.is_invited && event.my_answer === null) lists.suggested.push(event)
  }
  return lists
}

// Allt innehåll för events. Byggd på samma sätt som GroupsPanel: en egen
// <section className="app-section"> (som Klubbar och Personer) med rubrik och
// en rund plusknapp, flikar under och en lista per flik.
const NONE = []

function EventsPanel() {
  // Intressena (för formuläret och för att markera ens egna) hämtas ur minnet.
  const [interestsStatus, setInterestsStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [tab, setTab] = useState('mine')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // 'list', 'create' eller id för det event som visas. Vyn står i adressen
  // (/events?event=ID, /events?skapa=1), så att Tillbaka och webbläsarens bakåt går
  // till sidan innan, och andra sidor kan öppna en vy direkt. En klubb kan stå med
  // (?skapa=1&klubb=ID eller ?event=ID&klubb=ID): då är klubben förvald i formuläret,
  // och det är dit Tillbaka går om sidan öppnades via en länk.
  const view = Number(searchParams.get('event')) || (searchParams.get('skapa') ? 'create' : 'list')
  const fromGroupId = Number(searchParams.get('klubb')) || null
  // `replace` byter ut sidan i historiken i stället för att lägga till en.
  function setView(next, { replace = false } = {}) {
    if (next === view) return
    setSearchParams(next === 'list' ? {} : next === 'create' ? { skapa: '1' } : { event: String(next) }, { replace })
  }
  // Tillbaka till sidan innan. Finns ingen går man till klubben sidan kom från,
  // annars till listan.
  const goBack = useGoBack(() =>
    fromGroupId ? navigate(`/klubbar?klubb=${fromGroupId}`, { replace: true }) : setView('list', { replace: true }),
  )
  // Alla events man får se, ens klubbar (formuläret) och ens kontakter (för att
  // bjuda in), ur det delade minnet (se services/queryClient.js): har man varit
  // här nyss visas de direkt och hämtas om i bakgrunden. Det som ändrar ett event
  // (skapa, svara, bjuda in) säger själv till minnet (se services/events.js).
  // Flikarna räknas ut ur listan, men ett event man har svarat Nej på ligger inte
  // i någon flik och måste ändå gå att visa.
  const eventsResult = useQuery(eventsQuery)
  const groupsResult = useQuery(myGroupsQuery)
  const contactsResult = useQuery(contactsQuery)
  const events = eventsResult.data ?? NONE
  const myGroups = groupsResult.data ?? NONE
  const contacts = useMemo(() => (contactsResult.data?.contacts ?? []).map((c) => c.user), [contactsResult.data])
  // Misslyckas hämtningen av själva events visas ett fel i listan, men rubriken
  // och formuläret finns kvar. Ett fel efter att listan väl har visats syns inte;
  // det som redan visas ligger kvar.
  const eventsFailed = eventsResult.isError && eventsResult.data === undefined
  const failed = (result) => result.isError && result.data === undefined
  const status =
    interestsStatus === 'error' || failed(groupsResult) || failed(contactsResult)
      ? 'error'
      : interestsStatus === 'ready' && groupsResult.data && contactsResult.data && (eventsResult.data || eventsFailed)
        ? 'ready'
        : 'loading'
  const loadEvents = () => eventsResult.refetch()
  const [interests, setInterests] = useState([])
  // Fel från inbjudningarna när eventet skapades (eventet skapades ändå).
  const [inviteProblem, setInviteProblem] = useState('')
  const [myInterestIds, setMyInterestIds] = useState(new Set())

  useEffect(() => {
    Promise.all([getAllInterests(), getMyInterests()])
      .then(([allInterests, mine]) => {
        setInterests(allInterests)
        setMyInterestIds(new Set(mine.map((i) => i.id)))
        setInterestsStatus('ready')
      })
      .catch(() => setInterestsStatus('error'))
  }, [])

  async function handleCreated(created, problem) {
    setTab('mine')
    setInviteProblem(problem ? `Eventet skapades, men inbjudningarna gick inte att skicka: ${problem}` : '')
    await loadEvents()
    // Från en klubb går man tillbaka dit, om inte något gick fel som ska synas här.
    // Annars byts formuläret ut mot listan, så att Tillbaka inte öppnar det igen.
    if (fromGroupId && !problem) goBack()
    else setView('list', { replace: true })
  }

  const lists = splitEvents(events)
  // Leta upp eventet i hela listan, så att vyn visar ens senaste svar.
  const selected = typeof view === 'number' ? events.find((e) => e.id === view) : null

  return (
    <section className="app-section app-section-centered">
      <div className="page-header">
        <h1 className="app-title">Events</h1>
        {view !== 'create' && (
          <button
            type="button"
            className="primary-button round-button"
            aria-label="Skapa event"
            onClick={() => {
              setInviteProblem('')
              setView('create')
            }}
          />
        )}
      </div>

      {status === 'loading' ? (
        <p className="hint-text">Laddar events...</p>
      ) : status === 'error' ? (
        <p className="status-error">Kunde inte hämta sidan. Försök igen senare.</p>
      ) : view === 'create' ? (
        <>
          <BackButton onClick={goBack} />
          <div className="card sheet">
            <CreateEventForm
              interests={interests}
              groups={myGroups}
              contacts={contacts}
              initialGroupId={fromGroupId}
              onCreated={handleCreated}
              onCancel={goBack}
            />
          </div>
        </>
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
                onClick={() => {
                  setTab(t.id)
                  setView('list')
                }}
              >
                {t.label} ({lists[t.id].length})
              </button>
            ))}
          </div>

          {inviteProblem && <p className="status-error">{inviteProblem}</p>}
          {eventsFailed ? (
            <p className="status-error">Kunde inte hämta events. Försök igen senare.</p>
          ) : selected ? (
            <>
              <BackButton onClick={goBack} />
              <div className="card sheet">
                <EventDetails
                  event={selected}
                  myInterestIds={myInterestIds}
                  contacts={contacts}
                  groups={myGroups}
                  onAnswered={loadEvents}
                />
              </div>
            </>
          ) : (
            <>
              <EventList
                events={lists[tab]}
                emptyText={EMPTY_TEXT[tab]}
                myInterestIds={myInterestIds}
                onSelect={(e) => setView(e.id)}
              />
              {tab === 'invitations' && lists.declined.length > 0 && (
                <>
                  <h2>Nekade ({lists.declined.length})</h2>
                  <EventList
                    events={lists.declined}
                    emptyText=""
                    myInterestIds={myInterestIds}
                    onSelect={(e) => setView(e.id)}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

export default EventsPanel
