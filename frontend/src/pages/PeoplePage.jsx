import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { GENDER_OPTIONS, getMunicipalities } from '../services/profile'
import { dismissSuggestion, getPeople, resetDismissedSuggestions } from '../services/people'

const TABS = [
  { id: 'suggested', label: 'Förslag' },
  { id: 'incoming', label: 'Förfrågningar' },
  { id: 'contacts', label: 'Kontakter' },
]

// "Vill inte uppge" är inget att filtrera på.
const GENDER_FILTER_OPTIONS = GENDER_OPTIONS.filter((o) => o.value !== 'vill inte uppge')

// Samma gränser som backend (GET /users/). Tomt fält = inget filter (null),
// allt annat ogiltigt = NaN.
function parseAge(value) {
  if (value === '') return null
  const age = Number(value)
  return Number.isInteger(age) && age >= 0 && age <= 120 ? age : NaN
}

const EMPTY_TEXT = {
  suggested: 'Inga fler förslag just nu. Lägg till fler intressen på din profil för fler träffar.',
  incoming: 'Inga förfrågningar att svara på just nu.',
  outgoing: 'Inga skickade förfrågningar.',
  contacts: 'Inga kontakter än. Skicka en förfrågan till någon under Förslag.',
}

// Varför någon föreslås: hur många intressen man har gemensamt, med siffran
// framhävd. Vilka det är syns redan på kortet (gula taggar), så texten
// behöver inte räkna upp dem. null om inget är gemensamt.
function sharedInterestsText(person, myInterestIds) {
  const count = (person.interests ?? []).filter((interest) => myInterestIds.has(interest.id)).length
  if (count === 0) return null
  return (
    <>
      Ni har <strong className="shared-count">{count}</strong>{' '}
      {count === 1 ? 'gemensamt intresse' : 'gemensamma intressen'}
    </>
  )
}

// Personer-sidan: bläddra och filtrera andra användare (Förslag), svara på
// inkommande kontaktförfrågningar och ångra skickade (Förfrågningar) och se
// sina kontakter (Kontakter).
// Sidan är ett <section className="app-section"> rakt av, precis som
// pages/demo/DemoPeople.jsx - INTE inslaget i content-stack (den är byggd
// för smala centrerade sidor och krymper annars hela sidan efter innehållet,
// vilket flyttar om allt vid varje fliksbyte). Förslag kan filtreras på
// intresse, kommun, kön och ålder.
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
  const [filters, setFilters] = useState({
    interestId: '',
    municipalityCode: '',
    gender: '',
    minAge: '',
    maxAge: '',
  })
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

  // Åldrarna skickas bara när de går ihop, så att en halvskriven ålder inte
  // ger ett fel från servern. Felet visas i stället under filtren.
  const minAge = parseAge(filters.minAge)
  const maxAge = parseAge(filters.maxAge)
  const ageError =
    Number.isNaN(minAge) || Number.isNaN(maxAge)
      ? 'Ange en ålder mellan 0 och 120.'
      : minAge !== null && maxAge !== null && minAge > maxAge
        ? 'Från-åldern kan inte vara högre än till-åldern.'
        : ''
  const { interestId, municipalityCode, gender } = filters
  const query = useMemo(
    () => ({
      interestId,
      municipalityCode,
      gender,
      minAge: ageError ? null : minAge,
      maxAge: ageError ? null : maxAge,
    }),
    [interestId, municipalityCode, gender, minAge, maxAge, ageError],
  )

  const loadAll = useCallback(
    () =>
      Promise.all([getPeople(query), getContacts()]).then(([p, c]) => {
        setPeople(p)
        setContactsData(c)
      }),
    [query],
  )

  useEffect(() => {
    loadAll()
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'))
  }, [loadAll])

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
  const outgoingByUserId = new Map(
    contactsData.outgoing_requests.map((request) => [request.user.id, request]),
  )
  const excludedUserIds = new Set([
    ...contactsData.contacts.map((c) => c.user.id),
    ...contactsData.incoming_requests.map((r) => r.user.id),
  ])

  function sharedCount(person) {
    return (person.interests ?? []).filter((interest) => myInterestIds.has(interest.id)).length
  }

  const suggested = people
    .filter((person) => !excludedUserIds.has(person.id))
    .map((person) => ({ person, outgoing: outgoingByUserId.get(person.id) }))
    .sort((a, b) => sharedCount(b.person) - sharedCount(a.person))

  // Förslag delas i två: de man har minst ett intresse gemensamt med, och alla andra.
  const matches = suggested.filter(({ person }) => sharedCount(person) > 0)
  const others = suggested.filter(({ person }) => sharedCount(person) === 0)

  function suggestionCard({ person, outgoing }) {
    return (
      <PersonCard
        key={person.id}
        person={person}
        sharedInterestIds={myInterestIds}
        reason={sharedInterestsText(person, myInterestIds)}
        actions={
          <PersonActions
            relation={outgoing ? 'outgoing' : null}
            busy={busy}
            onSend={() => runAction(() => sendContactRequest(person.id))}
            onCancel={() => handleCancelRequest(outgoing)}
            onDismiss={() => handleDismiss(person)}
          />
        }
      />
    )
  }

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
    runAction(() => dismissSuggestion(person.id))
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
            <select
              aria-label="Filtrera på kön"
              value={filters.gender}
              onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
            >
              <option value="">Alla kön</option>
              {GENDER_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="filter-age-range">
              <span aria-hidden="true">Ålder</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                placeholder="från"
                aria-label="Från ålder"
                value={filters.minAge}
                onChange={(e) => setFilters({ ...filters, minAge: e.target.value })}
              />
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                placeholder="till"
                aria-label="Till ålder"
                value={filters.maxAge}
                onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })}
              />
            </div>
          </div>
          {ageError && <p className="status-error">{ageError}</p>}
          {filters.gender && (
            <p className="hint-text">Visar bara dem som valt att synas när man filtrerar på kön.</p>
          )}
          <button type="button" className="text-button" disabled={busy} onClick={handleResetDismissed}>
            Visa borttagna förslag igen
          </button>
        </>
      )}

      {error && <p className="status-error">{error}</p>}

      {status === 'loading' ? (
        <p className="hint-text">Laddar...</p>
      ) : tab === 'incoming' ? (
        <>
          <h2>Inkommande</h2>
          {contactsData.incoming_requests.length === 0 ? (
            <p className="hint-text">{EMPTY_TEXT.incoming}</p>
          ) : (
            <div className="card-grid card-grid-compact">
              {contactsData.incoming_requests.map((request) => (
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
            </div>
          )}

          <h2>Skickade</h2>
          {contactsData.outgoing_requests.length === 0 ? (
            <p className="hint-text">{EMPTY_TEXT.outgoing}</p>
          ) : (
            <div className="card-grid card-grid-compact">
              {contactsData.outgoing_requests.map((request) => (
                <PersonCard
                  key={request.id}
                  person={request.user}
                  actions={
                    <PersonActions
                      relation="outgoing"
                      busy={busy}
                      onCancel={() => handleCancelRequest(request)}
                    />
                  }
                />
              ))}
            </div>
          )}
        </>
      ) : lists[tab].length === 0 ? (
        <p className="hint-text">{EMPTY_TEXT[tab]}</p>
      ) : tab === 'suggested' ? (
        // Riktiga förslag (minst ett gemensamt intresse) först, med förklaring.
        // Övriga visas under en egen rubrik, så att det inte ser ut som att
        // systemet föreslår dem utan anledning.
        <>
          {matches.length > 0 && (
            <div className="card-grid card-grid-compact">{matches.map(suggestionCard)}</div>
          )}
          {others.length > 0 && (
            <>
              <h2>Fler i Intresseklubben</h2>
              <p className="hint-text">Ni har inga intressen gemensamt än.</p>
              <div className="card-grid card-grid-compact">{others.map(suggestionCard)}</div>
            </>
          )}
        </>
      ) : (
        <div className="card-grid card-grid-compact">
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
