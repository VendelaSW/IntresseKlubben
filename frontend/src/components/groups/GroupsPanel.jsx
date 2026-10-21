import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGoBack } from '../../hooks/useCanGoBack'
import { useTabParam } from '../../hooks/useTabParam'
import CreateGroupForm from './CreateGroupForm'
import BackButton from '../BackButton'
import CreateButton from '../CreateButton'
import GroupChat from './GroupChat'
import GroupDetails from './GroupDetails'
import GroupList from './GroupList'
import GroupPosts from './GroupPosts'
import GroupSortMenu from './GroupSortMenu'
import MunicipalityPicker from '../MunicipalityPicker'
import { getContacts } from '../../services/contacts'
import {
  declineGroupInvitation,
  deleteGroup,
  getGroups,
  groupsOverviewQuery,
  joinGroup,
  leaveGroup,
  matchesSearch,
  notifyInvitationsChanged,
  sortGroups,
} from '../../services/groups'
import { getAllInterests, getMyInterests } from '../../services/interests'
import { getMunicipalities, getProfile } from '../../services/profile'

const TABS = [
  { id: 'mine', label: 'Mina klubbar' },
  { id: 'suggested', label: 'Förslag' },
  { id: 'all', label: 'Alla' },
  { id: 'invitations', label: 'Inbjudningar' },
]

// Tomma flikar har en knapp vidare (se emptyAction nedan).
const EMPTY_TEXT = {
  mine: 'Du är inte med i någon klubb än.',
  suggested: 'Inga förslag just nu. Lägg till fler intressen på din profil för att få fler.',
  all: 'Inga klubbar hittades.',
  invitations: 'Du har inga inbjudningar just nu.',
}

// "Alla" hämtas så här många åt gången, med "Visa fler" för nästa.
const PAGE_SIZE = 24
// Så länge väntar sökningen efter senaste tangenttrycket, så att inte varje
// bokstav blir ett anrop.
const SEARCH_DELAY_MS = 300

// Allt innehåll för klubbar (intressegrupper): flikar, filter och klubbarna
// som kort i samma rutnät som Personer-sidan. Klick på ett kort visar mer
// information. Sökning, filter och sortering gäller alla flikar. "Alla"
// filtreras av backend och hämtas PAGE_SIZE åt gången, de andra två finns
// redan här.
// Utgången inloggning hanteras globalt i services/api.js.
const NONE = []

function GroupsPanel() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  // Fliken står i adressen, så att Tillbaka till listan kommer till samma flik (se useTabParam).
  const [urlTab, setTab] = useTabParam(TABS)
  const [searchParams, setSearchParams] = useSearchParams()
  // 'list', 'create' eller id för den klubb som visas. Vyn står i adressen
  // (/klubbar?klubb=ID, /klubbar?skapa=1), så att Tillbaka och webbläsarens bakåt
  // går till sidan innan, och andra sidor kan öppna en klubb direkt.
  const view = searchParams.get('skapa') ? 'create' : Number(searchParams.get('klubb')) || 'list'
  // `replace` byter ut sidan i historiken i stället för att lägga till en, t.ex.
  // efter att man har raderat klubben man tittade på.
  function setView(next, { replace = false } = {}) {
    if (next === view) return
    setSearchParams(next === 'list' ? {} : next === 'create' ? { skapa: '1' } : { klubb: String(next) }, { replace })
  }
  // Tillbaka till sidan innan, eller till listan om klubben öppnades via en länk.
  const goBack = useGoBack(() => setView('list', { replace: true }))
  // Sidorna av "Alla" som har hämtats (se loadAll).
  const [lists, setLists] = useState({ all: [] })
  // Finns det fler i "Alla" än de som hämtats?
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Sökning, filter och sortering, gemensamma för alla flikar. Ofiltrerat från
  // början, så att ingen flik döljer klubbar utan att man valt det. Satt redan
  // från start, så att "Alla" hämtas samtidigt som resten i stället för efter.
  const [filters, setFilters] = useState({
    interestId: '',
    municipalityCode: '',
    q: '',
    sort: 'name',
    reverse: false,
  })
  // Ens egen kommun, förvald när man skapar en klubb.
  const [myMunicipality, setMyMunicipality] = useState('')
  // Det som står i sökfältet. Skickas vidare till filters.q efter SEARCH_DELAY_MS.
  const [search, setSearch] = useState('')
  // Numret på senaste hämtningen av "Alla". Ett svar på en äldre hämtning
  // (t.ex. en sökning man hunnit skriva vidare på) kastas.
  const allRequest = useRef(0)
  const [interests, setInterests] = useState([])
  // Ens egna intressen, för att markera klubbarnas intresse om det är ett av dem.
  const [myInterestIds, setMyInterestIds] = useState(new Set())
  const [municipalities, setMunicipalities] = useState([])
  // Ens kompisar, för "Bjud in" i en klubb. Hämtas först när en klubb öppnas
  // (null = inte hämtade än), eftersom listan inte behövs förrän då.
  const [contacts, setContacts] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Klubben man nyss gick med i, för bekräftelsen "Du är med i …!" (tills nästa åtgärd eller flikbyte).
  const [joined, setJoined] = useState(null)

  const handleError = (err) => setError(err.message)

  useEffect(() => {
    Promise.all([getAllInterests(), getMunicipalities(), getProfile(), getMyInterests()])
      .then(([i, m, profile, mine]) => {
        setInterests(i)
        setMunicipalities(m)
        setMyInterestIds(new Set(mine.map((interest) => interest.id)))
        setMyMunicipality(profile?.municipality_code ?? '')
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    if (typeof view !== 'number' || contacts !== null) return
    getContacts()
      .then((data) => setContacts(data.contacts.map((c) => c.user)))
      // Utan kompisar går det ändå att se klubben, bara inte bjuda in.
      .catch(() => setContacts([]))
  }, [view, contacts])

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current === null || current.q === search ? current : { ...current, q: search }))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  // Mina klubbar, Förslag och Inbjudningar i ett anrop (GET /groups/overview), ur
  // det delade minnet (se services/queryClient.js): har man varit här nyss visas
  // de direkt och hämtas om i bakgrunden. Det som ändrar dem (gå med, lämna,
  // avböja) säger själv till minnet (se services/groups.js). Förslag och
  // inbjudningar innehåller redan bara klubbar man inte är med i.
  const overview = useQuery(groupsOverviewQuery)
  const { mine = NONE, suggested = NONE, invitations = NONE } = overview.data ?? {}
  // Utan vald flik: Mina klubbar, eller Förslag för den som inte är med i någon
  // klubb än (en tom flik är ingen bra början).
  const tab = urlTab ?? (overview.data && mine.length === 0 ? 'suggested' : 'mine')
  const overviewFailed = overview.isError && overview.data === undefined
  const { refetch: refetchOverview } = overview
  const loadMineAndSuggested = useCallback(() => refetchOverview(), [refetchOverview])

  // Hämtar en sida av "Alla" från offset. En extra klubb hämtas för att se
  // om det finns fler, men visas inte förrän nästa sida. "Alla" visar bara
  // klubbar man kan gå med i (excludeMine).
  const loadAll = useCallback(
    async (offset = 0) => {
      const request = ++allRequest.current
      const page = await getGroups({ ...filters, excludeMine: true, limit: PAGE_SIZE + 1, offset })
      if (request !== allRequest.current) return
      const shown = page.slice(0, PAGE_SIZE)
      setLists((current) => {
        if (offset === 0) return { ...current, all: shown }
        const loaded = new Set(current.all.map((g) => g.id))
        return { ...current, all: [...current.all, ...shown.filter((g) => !loaded.has(g.id))] }
      })
      setHasMore(page.length > PAGE_SIZE)
    },
    [filters],
  )

  useEffect(() => {
    if (filters === null) return
    loadAll()
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'))
  }, [filters, loadAll])

  async function handleShowMore() {
    setLoadingMore(true)
    setError('')
    try {
      await loadAll(lists.all.length)
    } catch (err) {
      handleError(err)
    } finally {
      setLoadingMore(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setFilters({ ...filters, interestId: '', municipalityCode: '', q: '' })
  }

  // Efter gå med, gå ur eller radera. Gick man med försvinner klubben ur
  // "Alla" utan att sidorna man redan har hämtat laddas om (servern har då
  // en klubb mindre, så nästa offset stämmer). Gick man ur kan den dyka upp
  // var som helst i "Alla", så den hämtas om från början.
  async function runAction(group, action) {
    setBusy(true)
    setError('')
    setJoined(null)
    try {
      await action(group.id)
      if (action === joinGroup) {
        setLists((current) => ({ ...current, all: current.all.filter((g) => g.id !== group.id) }))
        await loadMineAndSuggested()
        // Kortet försvinner ur Förslag och Alla, så det ska synas att det gick.
        setJoined(group)
      } else {
        await Promise.all([loadMineAndSuggested(), loadAll()])
      }
      // Gå med och avböj tar bort en inbjudan, och märket i headern ska stämma.
      notifyInvitationsChanged()
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  // Är någon man själv har blockerat med, frågar vi först. Vem det är syns inte.
  function handleJoin(group) {
    if (group.has_blocked_member && !window.confirm('Någon du har blockerat är med i klubben. Gå med ändå?')) return
    runAction(group, joinGroup)
  }

  function handleLeave(group) {
    if (!window.confirm(`Gå ur ${group.name}?`)) return
    runAction(group, leaveGroup)
  }

  async function handleDecline(group) {
    await runAction(group, declineGroupInvitation)
    // En privat klubb man har avböjt syns inte längre, så vi går tillbaka till listan
    // (till samma flik, t.ex. Inbjudningar).
    if (group.visibility === 'private') goBack()
  }

  async function handleDelete(group) {
    if (!window.confirm(`Radera ${group.name}? Det går inte att ångra.`)) return
    await runAction(group, deleteGroup)
    setView('list', { replace: true })
  }

  async function handleCreated(group) {
    await loadMineAndSuggested().catch(handleError)
    // Formuläret byts ut mot den nya klubben, så att Tillbaka inte öppnar formuläret igen.
    setView(group.id, { replace: true })
  }

  if (status === 'error' || overviewFailed) {
    return <p className="status-error">Kunde inte hämta klubbarna. Försök igen senare.</p>
  }

  // Mina klubbar och Förslag söks, filtreras och sorteras här. I Mina klubbar
  // ligger de man äger först (sort är stabil, så den valda ordningen behålls
  // inom varje del).
  const searchAndSort = (groups) =>
    sortGroups(
      groups.filter(
        (g) =>
          matchesSearch(g, filters.q) &&
          (!filters.interestId || g.interest_id === Number(filters.interestId)) &&
          (!filters.municipalityCode || g.municipality_code === filters.municipalityCode),
      ),
      filters.sort,
      filters.reverse,
    )
  const shown = filters && {
    mine: searchAndSort(mine).sort((a, b) => Number(b.is_owner) - Number(a.is_owner)),
    suggested: searchAndSort(suggested),
    all: lists.all,
    // Inbjudningarna visas alla, nyaste först, utan sökning och filter.
    invitations,
  }
  const filtering = filters && (filters.q || filters.interestId || filters.municipalityCode)

  // Leta upp gruppen i listorna, så att den visar senaste antal medlemmar och roll.
  const selected =
    typeof view === 'number'
      ? [...mine, ...suggested, ...lists.all, ...invitations].find((g) => g.id === view)
      : null

  return (
    <section className="app-section app-section-centered">
      <div className="page-header">
        <h1 className="app-title">Klubbar</h1>
        {view !== 'create' && <CreateButton label="Skapa klubb" onClick={() => setView('create')} />}
      </div>

      {/* Finns Mina klubbar redan i minnet visas sidan direkt, och "Alla" fylls i när den kommer. */}
      {status === 'loading' && overview.data === undefined ? (
        <p className="hint-text">Laddar klubbar...</p>
      ) : view === 'create' ? (
        <>
          <BackButton onClick={goBack} />
          <div className="card sheet">
            <CreateGroupForm
              interests={interests}
              municipalities={municipalities}
              defaultMunicipality={myMunicipality}
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
                  setJoined(null)
                  setTab(t.id)
                }}
              >
                {t.label} ({shown[t.id].length}
                {t.id === 'all' && hasMore ? '+' : ''})
              </button>
            ))}
          </div>

          {error && <p className="status-error">{error}</p>}
          {joined && (
            <div className="soft-box join-notice" role="status">
              <p className="soft-box-text">
                <strong>Du är med i {joined.name}!</strong> Den finns nu under Mina klubbar.
              </p>
              {!(tab === 'mine' && !selected) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setJoined(null)
                    setTab('mine')
                  }}
                >
                  Se Mina klubbar
                </button>
              )}
            </div>
          )}

          {selected ? (
            <>
              <BackButton onClick={goBack} />
              {/* Anslagstavlan överst, bara för medlemmar. Under den klubben till vänster och
                  chatten bredvid på dator, chatten under på mobil. */}
              {selected.is_member && (
                <GroupPosts key={selected.id} groupId={selected.id} isOwner={selected.is_owner} />
              )}
              <div className="group-layout">
                <div className="card sheet">
                  <GroupDetails
                    group={selected}
                    contacts={contacts ?? []}
                    busy={busy}
                    onJoin={handleJoin}
                    onLeave={handleLeave}
                    onDelete={handleDelete}
                    onDecline={handleDecline}
                  />
                </div>
                {selected.is_member && <GroupChat key={selected.id} groupId={selected.id} />}
              </div>
            </>
          ) : (
            <>
              <div className="search-row">
                <input
                  type="search"
                  className="filter-search"
                  aria-label="Sök klubbar"
                  placeholder="Sök på namn eller beskrivning"
                  maxLength={100}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <GroupSortMenu
                  sort={filters.sort}
                  reverse={filters.reverse}
                  onChange={(sort, reverse) => setFilters({ ...filters, sort, reverse })}
                />
              </div>
              <div className="filter-select-row filter-select-row-compact">
                <select
                  aria-label="Filtrera på intresse"
                  value={filters.interestId}
                  onChange={(e) => setFilters({ ...filters, interestId: e.target.value })}
                >
                  <option value="">Alla intressen</option>
                  {interests.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <MunicipalityPicker
                  aria-label="Filtrera på kommun"
                  municipalities={municipalities}
                  value={filters.municipalityCode}
                  onChange={(code) => setFilters({ ...filters, municipalityCode: code })}
                  emptyLabel="Alla kommuner"
                />
              </div>
              {shown[tab].length === 0 && filtering ? (
                <div className="content-stack">
                  <p className="hint-text">
                    Inga klubbar matchar din sökning eller dina filter.
                  </p>
                  <button type="button" className="secondary-button" onClick={clearFilters}>
                    Rensa filter
                  </button>
                </div>
              ) : (
                <GroupList
                  groups={shown[tab]}
                  emptyText={EMPTY_TEXT[tab]}
                  // En tom flik leder vidare: till Alla, eller till att skapa en
                  // klubb när det inte finns några alls.
                  emptyAction={
                    tab === 'all' ? (
                      <CreateButton label="Skapa klubb" onClick={() => setView('create')} />
                    ) : (
                      <button type="button" className="secondary-button" onClick={() => setTab('all')}>
                        Se alla klubbar
                      </button>
                    )
                  }
                  myInterestIds={myInterestIds}
                  busy={busy}
                  onSelect={(g) => setView(g.id)}
                  onJoin={handleJoin}
                  onDecline={handleDecline}
                />
              )}
              {tab === 'all' && hasMore && (
                <button type="button" className="secondary-button" disabled={loadingMore} onClick={handleShowMore}>
                  {loadingMore ? 'Hämtar...' : 'Visa fler'}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

export default GroupsPanel
