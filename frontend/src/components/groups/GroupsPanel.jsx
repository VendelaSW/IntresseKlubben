import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGoBack } from '../../hooks/useCanGoBack'
import { useTabParam } from '../../hooks/useTabParam'
import { useConfirm } from '../../hooks/useConfirm'
import CreateGroupForm from './CreateGroupForm'
import CreateOffer from '../CreateOffer'
import FilterTabs from '../FilterTabs'
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
  { id: 'mine', label: 'Mina klubbar', short: 'Mina' },
  { id: 'suggested', label: 'Förslag' },
  { id: 'all', label: 'Alla' },
  { id: 'invitations', label: 'Inbjudningar' },
]

// Tomma flikar har en knapp vidare (se emptyAction nedan).
// Flikarna som visar antalet.
const COUNTED_TABS = new Set(['suggested', 'invitations'])

// Vad fliken är till för, när den är tom (se EmptyState).
const EMPTY_TEXT = {
  mine: 'Här samlas klubbarna du är med i. Hitta en klubb för något du gillar under Alla, eller starta en egen.',
  suggested: 'Här föreslår vi klubbar för dina intressen. Lägg till fler intressen på din profil för att få fler förslag.',
  all: 'Här finns alla klubbar, men det finns inga än. Starta den första!',
  invitations: 'När någon bjuder in dig till en klubb hamnar inbjudan här.',
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
  const confirm = useConfirm()
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  // Fliken står i adressen, så att Tillbaka till listan kommer till samma flik (se useTabParam).
  const [urlTab, setTab] = useTabParam(TABS)
  const [searchParams, setSearchParams] = useSearchParams()
  // 'list', 'create' eller id för den klubb som visas. Vyn står i adressen
  // (/klubbar?klubb=ID, /klubbar?skapa=1), så att Tillbaka och webbläsarens bakåt
  // går till sidan innan, och andra sidor kan öppna en klubb direkt.
  const view = searchParams.get('skapa') ? 'create' : Number(searchParams.get('klubb')) || 'list'
  // Från "Det finns inga klubbar för … Vill du skapa en?" (SCRUM-221): formuläret med
  // det man sökte på ifyllt, som namn (?namn=…) och intresse (?intresse=ID).
  const createInterestId = Number(searchParams.get('intresse')) || null
  const createName = searchParams.get('namn') ?? ''
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
  // Klubbens anslagstavla, en egen vy inne i klubben. Stängs när man går till en annan klubb eller listan.
  const [boardOpen, setBoardOpen] = useState(false)
  useEffect(() => setBoardOpen(false), [view])

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

  // Formuläret för en ny klubb med det man sökte på ifyllt: sökordet som namn, och
  // intresset man filtrerat på, eller annars ett intresse som heter som sökordet
  // eller börjar med det som ett eget ord ("stickning" ger "Stickning och virkning").
  function openCreateFromSearch() {
    const q = filters.q.trim()
    const word = q.toLocaleLowerCase('sv')
    const name = (i) => i.name.toLocaleLowerCase('sv')
    const interestId =
      filters.interestId ||
      (word &&
        (interests.find((i) => name(i) === word) ?? interests.find((i) => name(i).startsWith(`${word} `)))?.id)
    setSearchParams({
      skapa: '1',
      ...(q && { namn: q }),
      ...(interestId && { intresse: String(interestId) }),
    })
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
  async function handleJoin(group) {
    if (
      group.has_blocked_member &&
      !(await confirm({
        title: `Gå med i ${group.name}`,
        text: 'Någon du har blockerat är med i klubben. Gå med ändå?',
        confirmLabel: 'Gå med',
      }))
    )
      return
    runAction(group, joinGroup)
  }

  async function handleLeave(group) {
    if (!(await confirm({ title: `Gå ur ${group.name}`, text: 'Vill du gå ur klubben?', confirmLabel: 'Gå ur', danger: true })))
      return
    runAction(group, leaveGroup)
  }

  async function handleDecline(group) {
    await runAction(group, declineGroupInvitation)
    // En privat klubb man har avböjt syns inte längre, så vi går tillbaka till listan
    // (till samma flik, t.ex. Inbjudningar).
    if (group.visibility === 'private') goBack()
  }

  async function handleDelete(group) {
    if (
      !(await confirm({
        title: `Radera ${group.name}`,
        text: 'Klubben tas bort för alla. Det går inte att ångra.',
        confirmLabel: 'Radera klubben',
        danger: true,
      }))
    )
      return
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
  // Vad man letade efter, för "Det finns inga klubbar för … Vill du skapa en?": intresset man filtrerat på,
  // annars sökordet. Erbjuds bara när ingen klubb alls matchar (varken bland ens egna eller under Alla, som
  // har alla andra), så att den inte säger "inga klubbar" när det finns en på en annan flik.
  const searchedFor =
    filters && (interests.find((i) => i.id === Number(filters.interestId))?.name ?? filters.q.trim())
  const offerToCreate = Boolean(searchedFor) && shown.mine.length === 0 && shown.all.length === 0

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
          <div className="card sheet sheet-form">
            <CreateGroupForm
              interests={interests}
              municipalities={municipalities}
              defaultMunicipality={myMunicipality}
              initialName={createName}
              initialInterestId={createInterestId}
              onCreated={handleCreated}
              onCancel={goBack}
            />
          </div>
        </>
      ) : (
        <>
          {/* Flikarna bara i listan. I en klubbs vy går man tillbaka till dem med "← Klubbar". */}
          {!selected && (
            <FilterTabs
              // Antalet bara där det är något nytt att se (Förslag och Inbjudningar), inte på Mina klubbar och Alla.
              tabs={TABS.map((t) => ({ ...t, count: COUNTED_TABS.has(t.id) ? shown[t.id].length : undefined }))}
              active={tab}
              onChange={(id) => {
                setJoined(null)
                setTab(id)
              }}
            />
          )}

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

          {selected && boardOpen && selected.is_member ? (
            <>
              {/* "← Klubbar" går tillbaka till klubben. */}
              <BackButton onClick={() => setBoardOpen(false)} />
              <GroupPosts key={selected.id} groupId={selected.id} isOwner={selected.is_owner} full />
            </>
          ) : selected ? (
            <>
              <BackButton onClick={goBack} />
              {/* Klubben till vänster och för medlemmar chatten till höger på dator, lika höga (chatten scrollar
                  i sin ruta). Under varandra på mobil. Anslagstavlan öppnas med en knapp i klubbens ruta. Den som
                  inte är med ser bara klubben, i hela bredden med events och medlemmar i en egen spalt. */}
              <div className="group-layout">
                <div className="card sheet detail-sheet">
                  <GroupDetails
                    group={selected}
                    contacts={contacts ?? []}
                    busy={busy}
                    onJoin={handleJoin}
                    onLeave={handleLeave}
                    onDelete={handleDelete}
                    onDecline={handleDecline}
                    onOpenBoard={() => setBoardOpen(true)}
                  />
                </div>
                {selected.is_member && (
                  <div className="group-chat-slot">
                    <GroupChat key={selected.id} groupId={selected.id} />
                  </div>
                )}
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
              {shown[tab].length === 0 && offerToCreate && tab !== 'invitations' ? (
                <CreateOffer
                  text={`Det finns inga klubbar för ${searchedFor}. Vill du skapa en?`}
                  createLabel="Skapa klubb"
                  onCreate={openCreateFromSearch}
                  onClear={clearFilters}
                />
              ) : shown[tab].length === 0 && filtering ? (
                <CreateOffer text="Inga klubbar matchar din sökning eller dina filter." onClear={clearFilters} />
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
