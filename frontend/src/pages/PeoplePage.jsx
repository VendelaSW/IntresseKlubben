import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PersonActions from '../components/PersonActions'
import MunicipalityPicker from '../components/MunicipalityPicker'
import kompisMedGlasogon from '../assets/kompis-glasogon.webp'
import EmptyState from '../components/EmptyState'
import FilterTabs from '../components/FilterTabs'
import InterestFilter from '../components/InterestFilter'
import PersonCard from '../components/PersonCard'
import { useTabParam } from '../hooks/useTabParam'
import {
  CANCEL_REQUEST,
  answerContactRequest,
  cancelContactRequest,
  contactsQuery,
  removeContact,
  removeContactConfirm,
  sendContactRequest,
} from '../services/contacts'
import { getMyInterests } from '../services/interests'
import { GENDER_OPTIONS, getMunicipalities } from '../services/profile'
import {
  dismissSuggestion,
  dismissedCountQuery,
  peopleQuery,
  resetDismissedSuggestions,
  undoDismissSuggestion,
} from '../services/people'
import { useConfirm } from '../hooks/useConfirm'
import LoadError from '../components/LoadError'

const TABS = [
  { id: 'suggested', label: 'Sök' },
  { id: 'incoming', label: 'Kompisförfrågningar', short: 'Förfrågningar' },
  { id: 'contacts', label: 'Kompisar' },
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

// Så länge "Ångra" syns efter att man tagit bort ett förslag.
const UNDO_MS = 8000

// Vad fliken är till för, när den är tom (se EmptyState).
const EMPTY_TEXT = {
  suggested: 'Här föreslår vi medlemmar som gillar samma saker som du. Lägg till fler intressen på din profil för fler träffar.',
  incoming: 'När någon vill bli din kompis hamnar förfrågan här.',
  outgoing: 'Kompisförfrågningar du har skickat och som väntar på svar hamnar här.',
  contacts: 'Här samlas dina kompisar. Skicka en kompisförfrågan till någon under Sök.',
}

function sharedCountOf(person, myInterestIds) {
  return (person.interests ?? []).filter((interest) => myInterestIds.has(interest.id)).length
}

// Hur många av de gemensamma intressena båda själva håller på med (SCRUM-271).
// `myPractisedIds` är ens egna intressen där practices är sant.
function sharedPractisedCountOf(person, myPractisedIds) {
  return (person.interests ?? []).filter((interest) => interest.practices && myPractisedIds.has(interest.id)).length
}

// "3 gemensamma intressen", med siffran framhävd. Vilka det är syns redan på
// kortet (gula taggar), så texten behöver inte räkna upp dem.
function sharedCountText(count) {
  return (
    <>
      <strong className="shared-count">{count}</strong> {count === 1 ? 'gemensamt intresse' : 'gemensamma intressen'}
    </>
  )
}

// Varför någon står under Kompisförfrågningar eller Kompisar: hur många intressen
// man har gemensamt. null om inget är gemensamt.
function sharedInterestsText(person, myInterestIds) {
  const count = sharedCountOf(person, myInterestIds)
  return count === 0 ? null : <>Ni har {sharedCountText(count)}</>
}

// Medlemmar-sidan: bläddra och filtrera andra användare (Sök), svara på
// inkommande kompisförfrågningar och ångra skickade (Förfrågningar) och se
// sina kompisar (Kompisar). Under Sök står de man har intressen
// gemensamt med under "Medlemmar med liknande intressen", i grupper efter hur
// många intressen man har gemensamt (rubriken ovanför varje grupp, så att det
// syns utan att läsa korten), och resten under "Fler i Intresseklubben". Inom
// en grupp står de först som håller på med flest av samma intressen som en själv.
// Sidan är ett <section className="app-section"> rakt av, precis som
// pages/demo/DemoPeople.jsx - INTE inslaget i content-stack (den är byggd
// för smala centrerade sidor och krymper annars hela sidan efter innehållet,
// vilket flyttar om allt vid varje fliksbyte). Sök kan filtreras på
// intresse, kommun, kön och ålder.
const NO_PEOPLE = []
const NO_CONTACTS = { contacts: [], incoming_requests: [], outgoing_requests: [] }

function PeoplePage() {
  const confirm = useConfirm()
  // Intressena och kommunerna (för filtren) och ens egna intressen kommer ur minnet.
  const [filterDataFailed, setFilterDataFailed] = useState(false)
  // Fliken står i adressen, så att Tillbaka från en profil kommer hit igen (se useTabParam).
  const [urlTab, setTab] = useTabParam(TABS)
  const tab = urlTab ?? 'suggested'
  const [myInterestIds, setMyInterestIds] = useState(new Set())
  const [myPractisedIds, setMyPractisedIds] = useState(new Set())
  // `interestId` är rullistans val (ett av ens egna intressen) och `pickedInterest` intresset man sökte fram bland alla;
  // bara ett av dem gäller åt gången (se InterestFilter).
  const [filters, setFilters] = useState({
    interestId: '',
    pickedInterest: null,
    municipalityCode: '',
    gender: '',
    minAge: '',
    maxAge: '',
  })
  const [myInterests, setMyInterests] = useState([])
  const [municipalities, setMunicipalities] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Den man nyss tog bort från Sök ({ id, name }), med "Ångra" en stund.
  const [removed, setRemoved] = useState(null)

  useEffect(() => {
    if (!removed) return undefined
    const timer = setTimeout(() => setRemoved(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [removed])

  const loadFilterData = useCallback(() => {
    setFilterDataFailed(false)
    Promise.all([getMunicipalities(), getMyInterests()])
      .then(([m, mine]) => {
        setMunicipalities(m)
        setMyInterests(mine)
        setMyInterestIds(new Set(mine.map((interest) => interest.id)))
        setMyPractisedIds(new Set(mine.filter((interest) => interest.practices).map((interest) => interest.id)))
      })
      .catch(() => setFilterDataFailed(true))
  }, [])

  useEffect(() => loadFilterData(), [loadFilterData])

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
  const { municipalityCode, gender } = filters
  const interestId = filters.pickedInterest ? String(filters.pickedInterest.id) : filters.interestId
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

  // Medlemmarna och ens kompisar ur det delade minnet (se services/queryClient.js):
  // har man varit här nyss visas de direkt och hämtas om i bakgrunden. När
  // filtren ändras ligger den förra listan kvar tills den nya har kommit.
  const peopleResult = useQuery({ ...peopleQuery(query), placeholderData: keepPreviousData })
  const contactsResult = useQuery(contactsQuery)
  // Hur många man har tagit bort från Sök. "Visa dem igen" syns bara då.
  const dismissedCount = useQuery(dismissedCountQuery).data?.count ?? 0
  const people = peopleResult.data ?? NO_PEOPLE
  const contactsData = contactsResult.data ?? NO_CONTACTS
  const failed = (result) => result.isError && result.data === undefined
  const status =
    filterDataFailed || failed(peopleResult) || failed(contactsResult)
      ? 'error'
      : peopleResult.data && contactsResult.data
        ? 'ready'
        : 'loading'
  // Efter en åtgärd (förfrågan, ta bort förslag...): hämta om, så att listorna stämmer.
  const loadAll = () => Promise.all([peopleResult.refetch(), contactsResult.refetch()])

  // "Försök igen" när sidan inte gick att hämta (SCRUM-286): bara det som misslyckades hämtas om.
  function retryPage() {
    if (filterDataFailed) loadFilterData()
    if (failed(peopleResult)) peopleResult.refetch()
    if (failed(contactsResult)) contactsResult.refetch()
  }

  if (status === 'error') {
    return (
      <div className="content-stack">
        <LoadError
          text="Kunde inte hämta medlemmarna."
          onRetry={retryPage}
          retrying={peopleResult.isFetching || contactsResult.isFetching}
        />
      </div>
    )
  }

  // Den som redan är ens kompis, eller har skickat en kompisförfrågan till en,
  // har sin egen flik - visa dem inte i Sök också. Den som redan fått en
  // förfrågan skickad till sig stannar kvar, men med en statuspill i stället
  // för "Skicka kompisförfrågan".
  const outgoingByUserId = new Map(
    contactsData.outgoing_requests.map((request) => [request.user.id, request]),
  )
  const excludedUserIds = new Set([
    ...contactsData.contacts.map((c) => c.user.id),
    ...contactsData.incoming_requests.map((r) => r.user.id),
  ])

  const sharedCount = (person) => sharedCountOf(person, myInterestIds)
  const sharedPractisedCount = (person) => sharedPractisedCountOf(person, myPractisedIds)

  const suggested = people
    .filter((person) => !excludedUserIds.has(person.id))
    .map((person) => ({ person, outgoing: outgoingByUserId.get(person.id) }))
    .sort(
      (a, b) =>
        sharedCount(b.person) - sharedCount(a.person) ||
        sharedPractisedCount(b.person) - sharedPractisedCount(a.person),
    )

  // Sök delas i två: de man har minst ett intresse gemensamt med, och alla andra.
  // De gemensamma grupperas efter antal, flest först (listan är redan sorterad).
  const matchGroups = []
  for (const item of suggested) {
    const count = sharedCount(item.person)
    if (count === 0) continue
    if (matchGroups.at(-1)?.count !== count) matchGroups.push({ count, items: [] })
    matchGroups.at(-1).items.push(item)
  }
  const others = suggested.filter(({ person }) => sharedCount(person) === 0)

  // Gemensamma intressen markerade och förklarade på korten under
  // Kompisförfrågningar och Kompisar. Under Sök står antalet i gruppens rubrik.
  function sharedProps(person) {
    return { sharedInterestIds: myInterestIds, reason: sharedInterestsText(person, myInterestIds) }
  }

  function suggestionCard({ person, outgoing }) {
    return (
      <PersonCard
        key={person.id}
        person={person}
        // Antalet gemensamma står i gruppens rubrik, inte på kortet.
        sharedInterestIds={myInterestIds}
        actions={
          <PersonActions
            userId={person.id}
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

  async function handleRemoveContact(contact) {
    const name = contact.user.name ?? contact.user.username
    if (!(await confirm(removeContactConfirm(name)))) return
    runAction(() => removeContact(contact.id))
  }

  async function handleCancelRequest(request) {
    if (!(await confirm(CANCEL_REQUEST))) return
    runAction(() => cancelContactRequest(request.id))
  }

  function handleDismiss(person) {
    runAction(async () => {
      await dismissSuggestion(person.id)
      setRemoved({ id: person.id, name: person.name ?? person.username })
    })
  }

  function handleUndoDismiss() {
    const { id } = removed
    setRemoved(null)
    runAction(() => undoDismissSuggestion(id))
  }

  async function handleResetDismissed() {
    if (
      !(await confirm({
        title: 'Visa borttagna igen',
        text: 'Visa alla du har tagit bort från förslagen igen?',
        confirmLabel: 'Visa igen',
      }))
    )
      return
    runAction(() => resetDismissedSuggestions())
  }

  return (
    <section className="app-section">
      <h1 className="app-title">Medlemmar</h1>

      {/* Antalet bara på Sök och Kompisförfrågningar, inte på Kompisar. */}
      <FilterTabs
        tabs={TABS.map((t) => ({ ...t, count: t.id === 'contacts' ? undefined : lists[t.id].length }))}
        active={tab}
        onChange={setTab}
      />

      {tab === 'suggested' && (
        <>
          <InterestFilter
            myInterests={myInterests}
            mineId={filters.interestId}
            picked={filters.pickedInterest}
            onPickMine={(id) => setFilters({ ...filters, interestId: id, pickedInterest: null })}
            onPick={(interest) => setFilters({ ...filters, interestId: '', pickedInterest: interest })}
          />
          <div className="filter-select-row filter-select-row-compact">
            <MunicipalityPicker
              aria-label="Filtrera på kommun"
              municipalities={municipalities}
              value={filters.municipalityCode}
              onChange={(code) => setFilters({ ...filters, municipalityCode: code })}
              emptyLabel="Alla kommuner"
            />
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
          {dismissedCount > 0 && (
            <p className="hint-text">
              {dismissedCount === 1 ? '1 medlem borttagen' : `${dismissedCount} medlemmar borttagna`} från förslagen.{' '}
              <button type="button" className="text-button" disabled={busy} onClick={handleResetDismissed}>
                Visa dem igen
              </button>
            </p>
          )}
        </>
      )}

      {error && <p className="status-error">{error}</p>}

      {status === 'loading' ? (
        <p className="hint-text">Laddar...</p>
      ) : tab === 'incoming' ? (
        <>
          <h2>Inkommande</h2>
          {contactsData.incoming_requests.length === 0 ? (
            <EmptyState compact image={kompisMedGlasogon} text={EMPTY_TEXT.incoming} />
          ) : (
            <div className="card-grid card-grid-compact">
              {contactsData.incoming_requests.map((request) => (
                <PersonCard
                  key={request.id}
                  person={request.user}
                  {...sharedProps(request.user)}
                  actions={
                    <PersonActions
                      userId={request.user.id}
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
            <EmptyState compact image={kompisMedGlasogon} text={EMPTY_TEXT.outgoing} />
          ) : (
            <div className="card-grid card-grid-compact">
              {contactsData.outgoing_requests.map((request) => (
                <PersonCard
                  key={request.id}
                  person={request.user}
                  {...sharedProps(request.user)}
                  actions={
                    <PersonActions
                      userId={request.user.id}
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
        <EmptyState image={kompisMedGlasogon} text={EMPTY_TEXT[tab]} />
      ) : tab === 'suggested' ? (
        // Riktiga förslag (minst ett gemensamt intresse) först, i grupper efter
        // antal. Övriga visas under en egen rubrik, så att det inte ser ut som
        // att systemet föreslår dem utan anledning.
        <>
          {matchGroups.length > 0 && (
            <>
              <h2>Medlemmar med liknande intressen</h2>
              <p className="hint-text">Flest gemensamma intressen först.</p>
              {matchGroups.map((group) => (
                <section key={group.count} className="match-group">
                  <h3 className="match-group-title">{sharedCountText(group.count)}</h3>
                  <div className="card-grid card-grid-compact">{group.items.map(suggestionCard)}</div>
                </section>
              ))}
            </>
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
                {...sharedProps(contact.user)}
                actions={
                  <PersonActions
                    userId={contact.user.id}
                    relation="contact"
                    busy={busy}
                    onRemove={() => handleRemoveContact(contact)}
                  />
                }
              />
            ))}
        </div>
      )}

      {/* Ligger kvar längst ner i blocket när man scrollar (position: sticky), så
          att den syns vid kortet man nyss tog bort. */}
      {removed && (
        <p className="undo-notice" role="status">
          {removed.name} är borttagen från förslagen.{' '}
          <button type="button" className="text-button" disabled={busy} onClick={handleUndoDismiss}>
            Ångra
          </button>
        </p>
      )}
    </section>
  )
}

export default PeoplePage
