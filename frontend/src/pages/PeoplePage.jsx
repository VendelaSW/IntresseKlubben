import { useCallback, useEffect, useState } from 'react'
import PersonActions from '../components/PersonActions'
import PersonCard from '../components/PersonCard'
import {
  answerContactRequest,
  cancelContactRequest,
  getContacts,
  removeContact,
  sendContactRequest,
} from '../services/contacts'
import { getAllInterests, getMyInterests } from '../services/interests'
import { getMunicipalities } from '../services/profile'
import { dismissSuggestion, getPeople, resetDismissedSuggestions } from '../services/people'

const TABS = [
  { id: 'suggested', label: 'Förslag' },
  { id: 'incoming', label: 'Förfrågningar' },
  { id: 'contacts', label: 'Kontakter' },
]

const EMPTY_TEXT = {
  suggested: 'Inga fler förslag just nu. Lägg till fler intressen på din profil för fler träffar.',
  incoming: 'Inga förfrågningar att svara på just nu.',
  contacts: 'Inga kontakter än. Skicka en förfrågan till någon under Förslag.',
}

// Personer-sidan: bläddra och filtrera andra användare (Förslag), svara på
// kontaktförfrågningar (Förfrågningar) och se sina kontakter (Kontakter).
// Sidan är ett <section className="app-section"> rakt av, precis som
// pages/demo/DemoPeople.jsx - INTE inslaget i content-stack (den är byggd
// för smala centrerade sidor och krymper annars hela sidan efter innehållet,
// vilket flyttar om allt vid varje fliksbyte). Förslag har kvar filtren på
// intresse/kommun från den första versionen av sidan.
function PeoplePage() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [tab, setTab] = useState('suggested')
  const [people, setPeople] = useState([])
  const [contactsData, setContactsData] = useState({
    contacts: [],
    incoming_requests: [],
    outgoing_requests: [],
  })
  const [myInterestIds, setMyInterestIds] = useState(new Set())
  const [filters, setFilters] = useState({ interestId: '', municipalityCode: '' })
  const [interests, setInterests] = useState([])
  const [municipalities, setMunicipalities] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getAllInterests(), getMunicipalities(), getMyInterests()])
      .then(([i, m, mine]) => {
        setInterests(i)
        setMunicipalities(m)
        setMyInterestIds(new Set(mine.map((interest) => interest.id)))
      })
      .catch(() => setStatus('error'))
  }, [])

  const loadAll = useCallback(
    () =>
      Promise.all([getPeople(filters), getContacts()]).then(([p, c]) => {
        setPeople(p)
        setContactsData(c)
      }),
    [filters],
  )

  useEffect(() => {
    loadAll()
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'))
  }, [filters, loadAll])

  if (status === 'error') {
    return (
      <div className="content-stack">
        <p className="status-error">Kunde inte hämta personerna. Försök igen senare.</p>
      </div>
    )
  }

  // Någon med en redan accepterad kontakt eller en inkommande förfrågan har
  // sin egen flik - visa dem inte i Förslag också. Den som redan fått en
  // förfrågan skickad till sig stannar kvar, men med en statuspill i stället
  // för "Skicka förfrågan".
  const outgoingByUsername = new Map(
    contactsData.outgoing_requests.map((request) => [request.user.username, request]),
  )
  const excludedUsernames = new Set([
    ...contactsData.contacts.map((c) => c.user.username),
    ...contactsData.incoming_requests.map((r) => r.user.username),
  ])

  function sharedCount(person) {
    return (person.interests ?? []).filter((interest) => myInterestIds.has(interest.id)).length
  }

  const suggested = people
    .filter((person) => !excludedUsernames.has(person.username))
    .map((person) => ({ person, outgoing: outgoingByUsername.get(person.username) }))
    .sort((a, b) => sharedCount(b.person) - sharedCount(a.person))

  const lists = {
    suggested,
    incoming: contactsData.incoming_requests,
    contacts: contactsData.contacts,
  }

  async function runAction(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleRemoveContact(contact) {
    const name = contact.user.name ?? contact.user.username
    if (!window.confirm(`Ta bort ${name} som kontakt?`)) return
    runAction(() => removeContact(contact.id))
  }

  function handleCancelRequest(request) {
    if (!window.confirm('Ångrar du denna förfrågan?')) return
    runAction(() => cancelContactRequest(request.id))
  }

  function handleDismiss(person) {
    runAction(() => dismissSuggestion(person.username))
  }

  function handleResetDismissed() {
    if (!window.confirm('Visa alla borttagna förslag igen?')) return
    runAction(() => resetDismissedSuggestions())
  }

  return (
    <section className="app-section">
      <h1 className="app-title">Personer</h1>

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

      {tab === 'suggested' && (
        <>
          <p className="hint-text">Sorterat efter flest gemensamma intressen.</p>
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
          <button type="button" className="text-button" disabled={busy} onClick={handleResetDismissed}>
            Visa borttagna förslag igen
          </button>
        </>
      )}

      {error && <p className="status-error">{error}</p>}

      {status === 'loading' ? (
        <p className="hint-text">Laddar...</p>
      ) : lists[tab].length === 0 ? (
        <p className="hint-text">{EMPTY_TEXT[tab]}</p>
      ) : (
        <div className="card-grid card-grid-compact">
          {tab === 'suggested' &&
            suggested.map(({ person, outgoing }) => (
              <PersonCard
                key={person.username}
                person={person}
                sharedInterestIds={myInterestIds}
                actions={
                  <PersonActions
                    relation={outgoing ? 'outgoing' : null}
                    busy={busy}
                    onSend={() => runAction(() => sendContactRequest(person.username))}
                    onCancel={() => handleCancelRequest(outgoing)}
                    onDismiss={() => handleDismiss(person)}
                  />
                }
              />
            ))}

          {tab === 'incoming' &&
            contactsData.incoming_requests.map((request) => (
              <PersonCard
                key={request.id}
                person={request.user}
                actions={
                  <PersonActions
                    relation="incoming"
                    busy={busy}
                    onAccept={() => runAction(() => answerContactRequest(request.id, 'accept'))}
                    onDecline={() => runAction(() => answerContactRequest(request.id, 'reject'))}
                  />
                }
              />
            ))}

          {tab === 'contacts' &&
            contactsData.contacts.map((contact) => (
              <PersonCard
                key={contact.id}
                person={contact.user}
                actions={
                  <PersonActions
                    relation="contact"
                    busy={busy}
                    onRemove={() => handleRemoveContact(contact)}
                  />
                }
              />
            ))}
        </div>
      )}
    </section>
  )
}

export default PeoplePage
