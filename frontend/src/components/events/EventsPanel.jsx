import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGoBack } from '../../hooks/useCanGoBack'
import { useTabParam } from '../../hooks/useTabParam'
import { PRE_DEV, useDesignChoice } from '../../hooks/useDesignChoice'
import CreateEventForm from './CreateEventForm'
import BackButton from '../BackButton'
import CreateButton from '../CreateButton'
import CreateOffer from '../CreateOffer'
import { PadHeadAction } from '../PadHead'
import EmptyState from '../EmptyState'
import FilterTabs from '../FilterTabs'
import EventDetails from './EventDetails'
import EventList from './EventList'
import { contactsQuery } from '../../services/contacts'
import { eventsQuery } from '../../services/events'
import { myGroupsQuery } from '../../services/groups'
import { getAllInterests, getMyInterests } from '../../services/interests'
import { useAuth } from '../../hooks/useAuth'
import { markEventsSeen } from '../../services/eventsSeen'
import { TIME_FILTERS, inTimeFilter } from '../../utils/eventTime'
import LoadError from '../LoadError'

const TABS = [
  { id: 'mine', label: 'Mina events', short: 'Mina' },
  { id: 'invitations', label: 'Inbjudningar' },
  { id: 'suggested', label: 'Förslag' },
]

// Vad fliken är till för, när den är tom (se EmptyState).
const EMPTY_TEXT = {
  mine: 'Här samlas events du ordnar eller ska gå på. Hitta något under Förslag, eller skapa ett eget.',
  invitations: 'När någon bjuder in dig till ett event hamnar inbjudan här, så att du kan svara.',
  suggested: 'Det finns inga events att föreslå just nu.',
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
  // Fliken står i adressen, så att Tillbaka till listan kommer till samma flik (se useTabParam).
  const [urlTab, setTab] = useTabParam(TABS)
  const tab = urlTab ?? 'mine'
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // 'list', 'create' eller id för det event som visas. Vyn står i adressen
  // (/events?event=ID, /events?skapa=1), så att Tillbaka och webbläsarens bakåt går
  // till sidan innan, och andra sidor kan öppna en vy direkt. En klubb kan stå med
  // (?skapa=1&klubb=ID eller ?event=ID&klubb=ID): då är klubben förvald i formuläret,
  // och det är dit Tillbaka går om sidan öppnades via en länk. Ett intresse kan stå
  // med när man skapar (?skapa=1&intresse=ID, från "Vill du skapa ett?"): då är det förvalt.
  const view = Number(searchParams.get('event')) || (searchParams.get('skapa') ? 'create' : 'list')
  const fromGroupId = Number(searchParams.get('klubb')) || null
  const createInterestId = Number(searchParams.get('intresse')) || null
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
  // Har man öppnat Events har man sett klubbarnas nya events, så de räknas
  // inte längre i märket (se services/eventsSeen.js).
  const { user } = useAuth()
  useEffect(() => {
    if (user) markEventsSeen(user.id)
  }, [user?.id])
  // Alla events man får se, ens klubbar (formuläret) och ens kompisar (för att
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
  // Visas formuläret för att redigera eventet som är öppet? Stängs när man byter vy.
  const [editing, setEditing] = useState(false)
  // "Eventet är raderat." ovanför listan, tills man öppnar något annat.
  const [notice, setNotice] = useState('')
  useEffect(() => {
    setEditing(false)
    if (view !== 'list') setNotice('')
  }, [view])
  const [myInterestIds, setMyInterestIds] = useState(new Set())
  // Filtren ('' = alla): tid (se utils/eventTime.js) och intresse. Gäller alla flikar.
  const [timeFilter, setTimeFilter] = useState('')
  const [interestFilter, setInterestFilter] = useState('')
  const filtering = Boolean(timeFilter || interestFilter)
  function clearFilters() {
    setTimeFilter('')
    setInterestFilter('')
  }
  // Formuläret, med intresset förvalt om det finns ett.
  function openCreate(interestId = null) {
    setInviteProblem('')
    setSearchParams(interestId ? { skapa: '1', intresse: String(interestId) } : { skapa: '1' })
  }

  const loadInterests = useCallback(() => {
    setInterestsStatus('loading')
    Promise.all([getAllInterests(), getMyInterests()])
      .then(([allInterests, mine]) => {
        setInterests(allInterests)
        setMyInterestIds(new Set(mine.map((i) => i.id)))
        setInterestsStatus('ready')
      })
      .catch(() => setInterestsStatus('error'))
  }, [])

  useEffect(() => loadInterests(), [loadInterests])

  // "Försök igen" när sidan inte gick att hämta (SCRUM-286): bara det som misslyckades hämtas om.
  function retryPage() {
    if (interestsStatus === 'error') loadInterests()
    if (failed(groupsResult)) groupsResult.refetch()
    if (failed(contactsResult)) contactsResult.refetch()
    if (eventsFailed) eventsResult.refetch()
  }

  async function handleCreated(created, problem) {
    setInviteProblem(problem ? `Eventet skapades, men inbjudningarna gick inte att skicka: ${problem}` : '')
    await loadEvents()
    // Från en klubb går man tillbaka dit, om inte något gick fel som ska synas här.
    // Annars byts formuläret ut mot listan på Mina events, så att Tillbaka inte
    // öppnar formuläret igen.
    if (fromGroupId && !problem) goBack()
    else setTab('mine')
  }

  // Eventet finns inte längre: tillbaka till klubben om man kom därifrån, annars
  // till listan (och inte bakåt till eventet, som är borta).
  // Vyn byts först, så att förklaringen för ett event som inte finns (se `missing`)
  // inte hinner visas när listan hämtas om.
  async function handleDeleted() {
    if (fromGroupId) {
      goBack()
    } else {
      setView('list', { replace: true })
      setNotice('Eventet är raderat.')
    }
    await loadEvents()
  }

  // Flikarna (och deras antal) visar bara events som passar filtren. `unfiltered`
  // säger om en tom flik är tom på grund av filtren (då erbjuds "Rensa filter").
  const unfiltered = splitEvents(events)
  const lists = filtering
    ? splitEvents(
        events.filter(
          (event) =>
            inTimeFilter(event, timeFilter) && (!interestFilter || event.interest_id === Number(interestFilter)),
        ),
      )
    : unfiltered
  // Förslag: events för ens egna intressen först, annars efter tid (som listan kommer).
  const suggested = [
    ...lists.suggested.filter((event) => myInterestIds.has(event.interest_id)),
    ...lists.suggested.filter((event) => !myInterestIds.has(event.interest_id)),
  ]
  const shown = { ...lists, suggested }
  const interestName = interests.find((i) => i.id === Number(interestFilter))?.name
  // Leta upp eventet i hela listan, så att vyn visar ens senaste svar.
  const selected = typeof view === 'number' ? events.find((e) => e.id === view) : null
  // Ett event som inte (längre) finns i listan: raderat av den som skapade det,
  // eller passerat. Visas med en förklaring i stället för att listan dyker upp
  // utan att man förstår varför (t.ex. via en gammal länk eller kartan).
  const missing = typeof view === 'number' && !selected && eventsResult.isSuccess
  const newPadHead = useDesignChoice('padHead') !== PRE_DEV

  return (
    <section className="app-section app-section-centered">
      <div className="page-header">
        <h1 className="app-title">Events</h1>
        {/* TILLFÄLLIGT: med den nya rubriken i testläget (useDesignChoice('padHead')) står knappen i blockets
            rubrikrad, och inte i ett events vy. Annars här, som vanligt. */}
        {view !== 'create' && !(newPadHead && (selected || missing)) && (
          <PadHeadAction>
            <CreateButton label="Skapa event" onClick={() => openCreate()} />
          </PadHeadAction>
        )}
      </div>

      {status === 'loading' ? (
        <p className="hint-text">Laddar events...</p>
      ) : status === 'error' ? (
        <LoadError
          text="Kunde inte hämta sidan."
          onRetry={retryPage}
          retrying={interestsStatus === 'loading' || groupsResult.isFetching || contactsResult.isFetching}
        />
      ) : view === 'create' ? (
        <>
          <BackButton onClick={goBack} />
          <div className="card sheet sheet-form">
            <CreateEventForm
              interests={interests}
              groups={myGroups}
              contacts={contacts}
              initialGroupId={fromGroupId}
              initialInterestId={createInterestId}
              onCreated={handleCreated}
              onCancel={goBack}
            />
          </div>
        </>
      ) : (
        <>
          {/* Flikarna bara i listan. I ett events vy går man tillbaka till dem med "← Events". */}
          {!selected && !missing && (
            // Antalet bara där det är något nytt att se (Inbjudningar och Förslag), inte på Mina events.
            <FilterTabs
              tabs={TABS.map((t) => ({ ...t, count: t.id === 'mine' ? undefined : lists[t.id].length }))}
              active={tab}
              onChange={setTab}
            />
          )}

          {inviteProblem && <p className="status-error">{inviteProblem}</p>}
          {notice && <p className="status-success">{notice}</p>}
          {eventsFailed ? (
            <LoadError text="Kunde inte hämta events." onRetry={loadEvents} retrying={eventsResult.isFetching} />
          ) : selected && editing && selected.is_owner ? (
            <>
              <BackButton onClick={() => setEditing(false)} />
              <div className="card sheet sheet-form">
                <CreateEventForm
                  // key: ett nytt formulär (med eventets uppgifter) varje gång man börjar redigera.
                  key={selected.id}
                  event={selected}
                  interests={interests}
                  groups={myGroups}
                  contacts={contacts}
                  onSaved={async () => {
                    await loadEvents()
                    setEditing(false)
                  }}
                  onCancel={() => setEditing(false)}
                />
              </div>
            </>
          ) : missing ? (
            <>
              <BackButton onClick={goBack} />
              <p className="hint-text">
                Eventet finns inte längre. Det kan ha raderats av den som skapade det, eller redan ha varit.
              </p>
            </>
          ) : selected ? (
            <>
              <BackButton onClick={goBack} />
              <div className="card sheet detail-sheet">
                <EventDetails
                  event={selected}
                  myInterestIds={myInterestIds}
                  contacts={contacts}
                  groups={myGroups}
                  onAnswered={loadEvents}
                  onEdit={() => setEditing(true)}
                  onDeleted={handleDeleted}
                />
              </div>
            </>
          ) : (
            <>
              <div className="filter-select-row filter-select-row-compact">
                <select aria-label="Filtrera på tid" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
                  {TIME_FILTERS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filtrera på intresse"
                  value={interestFilter}
                  onChange={(e) => setInterestFilter(e.target.value)}
                >
                  <option value="">Alla intressen</option>
                  {interests.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
              {shown[tab].length === 0 && interestName ? (
                <CreateOffer
                  text={`Det finns inga events för ${interestName}. Vill du skapa ett?`}
                  createLabel="Skapa event"
                  onCreate={() => openCreate(Number(interestFilter))}
                  onClear={clearFilters}
                />
              ) : shown[tab].length === 0 && unfiltered[tab].length > 0 ? (
                <CreateOffer text="Inga events matchar ditt filter." onClear={clearFilters} />
              ) : shown[tab].length === 0 && tab === 'suggested' ? (
                // Inga förslag alls: Intressekompisen erbjuder att skapa ett (SCRUM-221), som de andra tomma flikarna.
                <EmptyState text={`${EMPTY_TEXT.suggested} Vill du skapa ett?`}>
                  <button type="button" className="primary-button" onClick={() => openCreate()}>
                    Skapa event
                  </button>
                </EmptyState>
              ) : (
                <EventList
                  events={shown[tab]}
                  emptyText={EMPTY_TEXT[tab]}
                  myInterestIds={myInterestIds}
                  onSelect={(e) => setView(e.id)}
                />
              )}
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
