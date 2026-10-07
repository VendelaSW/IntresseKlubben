import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CreateGroupForm from './CreateGroupForm'
import GroupDetails from './GroupDetails'
import GroupList from './GroupList'
import GroupSortMenu from './GroupSortMenu'
import {
  deleteGroup,
  getGroups,
  getMyGroups,
  getSuggestedGroups,
  joinGroup,
  leaveGroup,
  matchesSearch,
  sortGroups,
} from '../../services/groups'
import { getAllInterests, getMyInterests } from '../../services/interests'
import { getMunicipalities, getProfile } from '../../services/profile'

const TABS = [
  { id: 'mine', label: 'Mina klubbar' },
  { id: 'suggested', label: 'Förslag' },
  { id: 'all', label: 'Alla' },
]

const EMPTY_TEXT = {
  mine: 'Du är inte med i någon klubb än.',
  suggested: 'Inga förslag just nu. Lägg till fler intressen på din profil för att få fler.',
  all: 'Inga klubbar hittades.',
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
function GroupsPanel() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [tab, setTab] = useState('mine')
  const [searchParams, setSearchParams] = useSearchParams()
  // 'list', 'create' eller id för den grupp som visas. /klubbar?klubb=ID öppnar en
  // klubb direkt (t.ex. efter att man har skapat ett event från den).
  const [view, setView] = useState(() => Number(searchParams.get('klubb')) || 'list')
  useEffect(() => {
    // Adressen har gjort sitt, så en omladdning ska inte öppna samma klubb igen.
    if (searchParams.toString()) setSearchParams({}, { replace: true })
  }, [])
  const [lists, setLists] = useState({ mine: [], suggested: [], all: [] })
  // Finns det fler i "Alla" än de som hämtats?
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Sökning, filter och sortering, gemensamma för alla flikar. Ofiltrerat från
  // början, så att ingen flik döljer klubbar utan att man valt det.
  const [filters, setFilters] = useState(null)
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleError = (err) => setError(err.message)

  useEffect(() => {
    Promise.all([getAllInterests(), getMunicipalities(), getProfile(), getMyInterests()])
      .then(([i, m, profile, mine]) => {
        setInterests(i)
        setMunicipalities(m)
        setMyInterestIds(new Set(mine.map((interest) => interest.id)))
        setMyMunicipality(profile?.municipality_code ?? '')
        setFilters({
          interestId: '',
          municipalityCode: '',
          q: '',
          sort: 'name',
          reverse: false,
        })
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current === null || current.q === search ? current : { ...current, q: search }))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  const loadMineAndSuggested = useCallback(
    () =>
      Promise.all([getMyGroups(), getSuggestedGroups()]).then(([mine, suggested]) =>
        // Förslag innehåller redan bara klubbar man inte är med i.
        setLists((current) => ({ ...current, mine, suggested })),
      ),
    [],
  )

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
    loadMineAndSuggested().catch(() => setStatus('error'))
  }, [loadMineAndSuggested])

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
    try {
      await action(group.id)
      if (action === joinGroup) {
        setLists((current) => ({ ...current, all: current.all.filter((g) => g.id !== group.id) }))
        await loadMineAndSuggested()
      } else {
        await Promise.all([loadMineAndSuggested(), loadAll()])
      }
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

  async function handleDelete(group) {
    if (!window.confirm(`Radera ${group.name}? Det går inte att ångra.`)) return
    await runAction(group, deleteGroup)
    setView('list')
  }

  async function handleCreated(group) {
    setTab('mine')
    await loadMineAndSuggested().catch(handleError)
    setView(group.id)
  }

  if (status === 'error') {
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
    mine: searchAndSort(lists.mine).sort((a, b) => Number(b.is_owner) - Number(a.is_owner)),
    suggested: searchAndSort(lists.suggested),
    all: lists.all,
  }
  const filtering = filters && (filters.q || filters.interestId || filters.municipalityCode)

  // Leta upp gruppen i listorna, så att den visar senaste antal medlemmar och roll.
  const selected =
    typeof view === 'number'
      ? [...lists.mine, ...lists.suggested, ...lists.all].find((g) => g.id === view)
      : null

  return (
    <section className="app-section app-section-centered">
      <div className="page-header">
        <h1 className="app-title">Klubbar</h1>
        {view !== 'create' && (
          <button
            type="button"
            className="primary-button round-button"
            aria-label="Skapa klubb"
            onClick={() => setView('create')}
          />
        )}
      </div>

      {status === 'loading' ? (
        <p className="hint-text">Laddar klubbar...</p>
      ) : view === 'create' ? (
        <div className="card sheet">
          <CreateGroupForm
            interests={interests}
            municipalities={municipalities}
            defaultMunicipality={myMunicipality}
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
                onClick={() => {
                  setTab(t.id)
                  setView('list')
                }}
              >
                {t.label} ({shown[t.id].length}
                {t.id === 'all' && hasMore ? '+' : ''})
              </button>
            ))}
          </div>

          {error && <p className="status-error">{error}</p>}

          {selected ? (
            <div className="card sheet">
              <GroupDetails
                group={selected}
                busy={busy}
                onJoin={handleJoin}
                onLeave={handleLeave}
                onDelete={handleDelete}
                onBack={() => setView('list')}
              />
            </div>
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
                <select
                  aria-label="Filtrera på kommun"
                  value={filters.municipalityCode}
                  onChange={(e) => setFilters({ ...filters, municipalityCode: e.target.value })}
                >
                  <option value="">Alla kommuner</option>
                  {municipalities.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </select>
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
                  myInterestIds={myInterestIds}
                  busy={busy}
                  onSelect={(g) => setView(g.id)}
                  onJoin={handleJoin}
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
