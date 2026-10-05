import { useCallback, useEffect, useState } from 'react'
import CreateGroupForm from './CreateGroupForm'
import GroupDetails from './GroupDetails'
import GroupList from './GroupList'
import {
  deleteGroup,
  getGroups,
  getMyGroups,
  getSuggestedGroups,
  joinGroup,
  leaveGroup,
} from '../../services/groups'
import { getAllInterests } from '../../services/interests'
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

// Allt innehåll för klubbar (intressegrupper). Ligger på en egen sida nu, men
// är byggd för att senare kunna visas i ett litet fönster som öppnas från en
// knapp. titleTag är h1 på den egna sidan och kan vara h2 i fönstret.
// Utgången inloggning hanteras globalt i services/api.js.
function GroupsPanel({ titleTag: Title = 'h2' }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [tab, setTab] = useState('mine')
  // 'list', 'create' eller id för den grupp som visas.
  const [view, setView] = useState('list')
  const [lists, setLists] = useState({ mine: [], suggested: [], all: [] })
  // "Alla" visar grupper i ens egen kommun från början, om man har angett en.
  const [filters, setFilters] = useState(null)
  const [interests, setInterests] = useState([])
  const [municipalities, setMunicipalities] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleError = (err) => setError(err.message)

  useEffect(() => {
    Promise.all([getAllInterests(), getMunicipalities(), getProfile()])
      .then(([i, m, profile]) => {
        setInterests(i)
        setMunicipalities(m)
        setFilters({ interestId: '', municipalityCode: profile?.municipality_code ?? '' })
      })
      .catch(() => setStatus('error'))
  }, [])

  const loadGroups = useCallback(
    () =>
      Promise.all([getMyGroups(), getSuggestedGroups(), getGroups(filters)]).then(([mine, suggested, all]) =>
        setLists({
          // Klubbar man äger först. Listorna kommer sorterade på namn, och
          // sort är stabil, så namnordningen behålls inom varje del.
          mine: [...mine].sort((a, b) => Number(b.is_owner) - Number(a.is_owner)),
          // Förslag innehåller redan bara klubbar man inte är med i.
          suggested,
          // "Alla" visar bara klubbar man kan gå med i.
          all: all.filter((g) => !g.is_member),
        }),
      ),
    [filters],
  )

  useEffect(() => {
    if (filters === null) return
    loadGroups()
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'))
  }, [filters, loadGroups])

  async function runAction(group, action) {
    setBusy(true)
    setError('')
    try {
      await action(group.id)
      await loadGroups()
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(group) {
    if (!window.confirm(`Radera ${group.name}? Det går inte att ångra.`)) return
    await runAction(group, deleteGroup)
    setView('list')
  }

  async function handleCreated(group) {
    setTab('mine')
    await loadGroups().catch(handleError)
    setView(group.id)
  }

  if (status === 'loading') return <p className="hint-text">Laddar klubbar...</p>
  if (status === 'error') {
    return <p className="status-error">Kunde inte hämta klubbarna. Försök igen senare.</p>
  }

  // Leta upp gruppen i listorna, så att den visar senaste antal medlemmar och roll.
  const selected =
    typeof view === 'number'
      ? [...lists.mine, ...lists.suggested, ...lists.all].find((g) => g.id === view)
      : null

  return (
    <section className="card card-wide groups-panel">
      <div className="groups-panel-header">
        <Title className="groups-panel-title">Klubbar</Title>
        {view !== 'create' && (
          <button
            type="button"
            className="primary-button round-button"
            aria-label="Skapa klubb"
            onClick={() => setView('create')}
          />
        )}
      </div>

      {view === 'create' ? (
        <CreateGroupForm
          interests={interests}
          municipalities={municipalities}
          defaultMunicipality={filters.municipalityCode}
          onCreated={handleCreated}
          onCancel={() => setView('list')}
        />
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
                onClick={() => {
                  setTab(t.id)
                  setView('list')
                }}
              >
                {t.label} ({lists[t.id].length})
              </button>
            ))}
          </div>

          {error && <p className="status-error">{error}</p>}

          {selected ? (
            <GroupDetails
              group={selected}
              busy={busy}
              onJoin={(g) => runAction(g, joinGroup)}
              onLeave={(g) => runAction(g, leaveGroup)}
              onDelete={handleDelete}
              onBack={() => setView('list')}
            />
          ) : (
            <>
              {tab === 'all' && (
                <div className="filter-select-row">
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
              )}
              <GroupList groups={lists[tab]} emptyText={EMPTY_TEXT[tab]} onSelect={(g) => setView(g.id)} />
            </>
          )}
        </>
      )}
    </section>
  )
}

export default GroupsPanel
