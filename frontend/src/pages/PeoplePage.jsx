import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import PersonActions from '../components/PersonActions'
import MunicipalityPicker from '../components/MunicipalityPicker'
import kompisMedGlasogon from '../assets/kompis-glasogon.webp'
import AgeRangeSlider, { ageText } from '../components/AgeRangeSlider'
import EmptyState from '../components/EmptyState'
import FilterTabs from '../components/FilterTabs'
import InterestPicker from '../components/InterestPicker'
import MatchPanel from '../components/MatchPanel'
import MultiOptionPicker from '../components/MultiOptionPicker'
import PersonCard from '../components/PersonCard'
import { useDesignChoice } from '../hooks/useDesignChoice'
import { useResetOnTabChange, useTabParam } from '../hooks/useTabParam'
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
import { GENDER_OPTIONS, genderLabel, getMunicipalities } from '../services/profile'
import {
  dismissSuggestion,
  dismissedCountQuery,
  peoplePages,
  peopleQuery,
  resetDismissedSuggestions,
  undoDismissSuggestion,
} from '../services/people'
import { useConfirm } from '../hooks/useConfirm'
import { useMediaQuery } from '../hooks/useMediaQuery'
import LoadError from '../components/LoadError'
import { MAX_AGE, MIN_AGE } from '../utils/age'

const TABS = [
  { id: 'match', label: 'Matcha' },
  { id: 'suggested', label: 'Sök' },
  { id: 'incoming', label: 'Kompisförfrågningar', short: 'Förfrågningar' },
  { id: 'contacts', label: 'Kompisar' },
]

// "Vill inte uppge" är inget att filtrera på.
const GENDER_FILTER_OPTIONS = GENDER_OPTIONS.filter((o) => o.value !== 'vill inte uppge')

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

// "3 gemensamma intressen", med siffran framhävd. Vilka det är syns redan på
// kortet (gula taggar), så texten behöver inte räkna upp dem.
function sharedCountText(count) {
  return (
    <>
      <strong className="shared-count">{count}</strong> {count === 1 ? 'gemensamt intresse' : 'gemensamma intressen'}
    </>
  )
}

// Varför någon står under Kompisförfrågningar: hur många intressen man har
// gemensamt. null om inget är gemensamt.
function sharedInterestsText(person, myInterestIds) {
  const count = sharedCountOf(person, myInterestIds)
  return count === 0 ? null : <>Ni har {sharedCountText(count)}</>
}

// Medlemmar-sidan: bläddra och filtrera andra användare (Sök), svara på
// inkommande kompisförfrågningar och ångra skickade (Förfrågningar) och se
// sina kompisar (Kompisar). Under Sök står de man har intressen
// gemensamt med under "Medlemmar med liknande intressen", i grupper efter hur
// många intressen man har gemensamt (rubriken ovanför varje grupp, så att det
// syns utan att läsa korten), och resten under "Fler i Intresseklubben". Ordningen
// kommer från API:t (flest gemensamma intressen först, därefter namn) och sorteras inte om här.
// Sidan är ett <section className="app-section"> rakt av, precis som
// pages/demo/DemoPeople.jsx - INTE inslaget i content-stack (den är byggd
// för smala centrerade sidor och krymper annars hela sidan efter innehållet,
// vilket flyttar om allt vid varje fliksbyte). Sök kan filtreras på
// intresse, kommun, kön och ålder.
const NO_CONTACTS = { contacts: [], incoming_requests: [], outgoing_requests: [] }
// Inga filter valda. Filtren nollställs när man byter flik.
// Intressen ({ id, name }), kommunkoder och kön är listor: flera val i samma filter räcker med ett av dem.
const NO_FILTERS = {
  interests: [],
  municipalityCodes: [],
  genders: [],
  // Åldersreglaget: null = ingen gräns åt det hållet (se AgeRangeSlider).
  minAge: null,
  maxAge: null,
}

function PeoplePage() {
  const confirm = useConfirm()
  // TILLFÄLLIGT (testläget): matchningssidans layout (väljaren "Matchningssidan"), se MatchPanel.
  const matchLayout = useDesignChoice('matchLayout')
  // Intressena och kommunerna (för filtren) och ens egna intressen kommer ur minnet.
  const [filterDataFailed, setFilterDataFailed] = useState(false)
  // Fliken står i adressen, så att Tillbaka från en profil kommer hit igen (se useTabParam).
  const [urlTab, setTab] = useTabParam(TABS)
  // Matcha är första fliken och den som öppnas när adressen inte säger något annat.
  const tab = urlTab ?? 'match'
  // Filterraderna som papperslappar: i Matcha och Sök, i layouten Nicklas förslag 1 (se .filter-select-row-paper).
  const paperRow = (tab === 'match' || tab === 'suggested') && matchLayout === 'nicklas-1'
  const [myInterestIds, setMyInterestIds] = useState(new Set())
  // `interest` är intresset i Sök ({ id, name }, se InterestPicker) eller null.
  const [filters, setFilters] = useState(NO_FILTERS)
  useResetOnTabChange(tab, () => setFilters(NO_FILTERS))
  const [myInterests, setMyInterests] = useState([])
  const [municipalities, setMunicipalities] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Den man nyss tog bort från Sök ({ id, name }), med "Ångra" en stund.
  const [removed, setRemoved] = useState(null)
  // Filterfälten ligger bakom en Filter-knapp och är ihopfällda från början.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterPanelId = useId()
  // På en smal skärm står bara "Intresse", "Kommun" och "Kön" i tomma fält, så att alla tre får plats på en rad.
  const narrow = useMediaQuery('(max-width: 767px)')

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
      })
      .catch(() => setFilterDataFailed(true))
  }, [])

  useEffect(() => loadFilterData(), [loadFilterData])

  const { interests, municipalityCodes, genders, minAge, maxAge } = filters
  const query = useMemo(
    () => ({ interestIds: interests.map((i) => i.id), municipalityCodes, genders, minAge, maxAge }),
    [interests, municipalityCodes, genders, minAge, maxAge],
  )

  // Medlemmarna och ens kompisar ur det delade minnet (se services/queryClient.js):
  // har man varit här nyss visas de direkt och hämtas om i bakgrunden. När
  // filtren ändras ligger den förra listan kvar tills den nya har kommit.
  // Medlemmarna kommer en sida i taget (SCRUM-321): "Visa fler" hämtar nästa, och
  // med nya filter börjar det om på första sidan (se peopleQuery).
  const peopleResult = useInfiniteQuery({ ...peopleQuery(query), placeholderData: keepPreviousData })
  const contactsResult = useQuery(contactsQuery)
  // Hur många man har tagit bort från Sök. "Visa dem igen" syns bara då.
  const dismissedCount = useQuery(dismissedCountQuery).data?.count ?? 0
  const people = useMemo(() => peoplePages(peopleResult.data), [peopleResult.data])
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
  // har sin egen flik - visa dem inte i Sök också. Backend lämnar redan bort dem
  // (SCRUM-321), men listorna hämtas var för sig, så de sorteras bort här också
  // tills båda har hämtats om (t.ex. direkt efter att man svarat på en
  // förfrågan). Den som redan fått en förfrågan skickad till sig stannar kvar,
  // men med en statuspill i stället för "Skicka kompisförfrågan".
  const outgoingByUserId = new Map(
    contactsData.outgoing_requests.map((request) => [request.user.id, request]),
  )
  const excludedUserIds = new Set([
    ...contactsData.contacts.map((c) => c.user.id),
    ...contactsData.incoming_requests.map((r) => r.user.id),
  ])

  const sharedCount = (person) => sharedCountOf(person, myInterestIds)

  // Ordningen kommer från API:t (GET /users/: flest gemensamma intressen först, därefter namn), så den sorteras inte om här.
  const suggested = people
    .filter((person) => !excludedUserIds.has(person.id))
    .map((person) => ({ person, outgoing: outgoingByUserId.get(person.id) }))

  // Sök delas i två: de man har minst ett intresse gemensamt med, och alla andra.
  // De gemensamma grupperas efter antal, flest först (listan kommer redan så från API:t).
  const matchGroups = []
  for (const item of suggested) {
    const count = sharedCount(item.person)
    if (count === 0) continue
    if (matchGroups.at(-1)?.count !== count) matchGroups.push({ count, items: [] })
    matchGroups.at(-1).items.push(item)
  }
  const others = suggested.filter(({ person }) => sharedCount(person) === 0)

  // Gemensamma intressen markerade och förklarade på korten under
  // Kompisförfrågningar. Under Sök står antalet i gruppens rubrik, och under
  // Kompisar markeras de bara (SCRUM-321): de gula taggarna räcker.
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

  // Filtren som är på, som lappar under Filter-knappen, var och en med ett kryss som tar bort den. Antalet står på
  // knappen. Intressefiltret finns bara i Sök.
  const without = (list, item) => list.filter((other) => other !== item)
  const activeFilters = [
    ...(tab === 'suggested' ? interests : []).map((interest) => ({
      key: `interest:${interest.id}`,
      label: interest.name,
      clear: { interests: without(interests, interest) },
    })),
    ...municipalityCodes.map((code) => ({
      key: `municipality:${code}`,
      label: municipalities.find((m) => m.code === code)?.name ?? code,
      clear: { municipalityCodes: without(municipalityCodes, code) },
    })),
    ...genders.map((gender) => ({
      key: `gender:${gender}`,
      label: genderLabel(gender),
      clear: { genders: without(genders, gender) },
    })),
    ...(minAge !== null || maxAge !== null
      ? [{ key: 'age', label: ageText(minAge ?? MIN_AGE, maxAge ?? MAX_AGE), clear: { minAge: null, maxAge: null } }]
      : []),
  ]

  // Kommun och kön. I Sök står intressefiltret först på samma rad. Intresse och kommun fylls på: varje val blir en
  // lapp under Filter-knappen, och fältet står kvar tomt för nästa. Kön kryssas i, flera på en gång.
  const demographics = (
    <>
      <MunicipalityPicker
        aria-label="Lägg till en kommun"
        municipalities={municipalities}
        value=""
        onChange={(code) =>
          code &&
          !municipalityCodes.includes(code) &&
          setFilters({ ...filters, municipalityCodes: [...municipalityCodes, code] })
        }
        emptyLabel={narrow ? 'Kommun' : municipalityCodes.length > 0 ? 'Lägg till kommun' : 'Alla kommuner'}
      />
      <MultiOptionPicker
        aria-label="Filtrera på kön"
        values={genders}
        onChange={(next) => setFilters({ ...filters, genders: next })}
        options={GENDER_FILTER_OPTIONS}
        emptyLabel={narrow ? 'Kön' : 'Alla kön'}
      />
    </>
  )

  return (
    <section className="app-section">
      <h1 className="app-title">Medlemmar</h1>

      {/* Antalet bara på Kompisförfrågningar, där det finns något att svara på (SCRUM-321). */}
      <FilterTabs
        tabs={TABS.map((t) => ({ ...t, count: t.id === 'incoming' ? lists.incoming.length : undefined }))}
        active={tab}
        onChange={setTab}
      />

      {(tab === 'suggested' || tab === 'match') && (
        <>
          {/* Filterfälten bakom en knapp, som visar hur många filter som är på. Utfällda: intresse (i Sök), kommun och
              kön på en rad, och åldern ensam på raden under, så att reglaget får plats att vara långt. I layouten
              Nicklas förslag 1 är fälten papperslappar (se .filter-select-row-paper). */}
          <button
            type="button"
            className={`filter-toggle${paperRow ? ' filter-toggle-paper' : ''}${filtersOpen ? ' is-open' : ''}`}
            aria-expanded={filtersOpen}
            aria-controls={filterPanelId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filter{activeFilters.length > 0 ? ` · ${activeFilters.length}` : ''}
          </button>
          {activeFilters.length > 0 && (
            <ul className="interest-tags filter-chips" aria-label="Valda filter">
              {activeFilters.map((chip) => (
                <li key={chip.key}>
                  <span className="interest-tag">
                    {chip.label}
                    <button
                      type="button"
                      className="interest-tag-remove"
                      aria-label={`Ta bort filtret ${chip.label}`}
                      onClick={() => setFilters({ ...filters, ...chip.clear })}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
              <li>
                <button type="button" className="text-button" onClick={() => setFilters(NO_FILTERS)}>
                  Rensa alla
                </button>
              </li>
            </ul>
          )}
          {filtersOpen && (
            <div id={filterPanelId} className="filter-panel">
              <div className={`filter-select-row${paperRow ? ' filter-select-row-paper' : ''}`}>
                {tab === 'suggested' && (
                  <InterestPicker
                    aria-label="Lägg till ett intresse"
                    placeholder={narrow ? 'Intresse' : interests.length > 0 ? 'Lägg till intresse' : 'Alla intressen'}
                    myInterests={myInterests}
                    value={null}
                    onChange={(interest) =>
                      interest &&
                      !interests.some((i) => i.id === interest.id) &&
                      setFilters({ ...filters, interests: [...interests, interest] })
                    }
                  />
                )}
                {demographics}
              </div>
              <div className={`filter-age-row${paperRow ? ' filter-select-row-paper' : ''}`}>
                <AgeRangeSlider
                  value={{ min: filters.minAge, max: filters.maxAge }}
                  onChange={({ min, max }) => setFilters({ ...filters, minAge: min, maxAge: max })}
                />
              </div>
            </div>
          )}
          {genders.length > 0 && (
            <p className="hint-text">Visar bara dem som valt att synas när man filtrerar på kön.</p>
          )}
          {tab === 'suggested' && dismissedCount > 0 && (
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

      {tab === 'match' ? (
        <MatchPanel
          municipalityCodes={query.municipalityCodes}
          genders={query.genders}
          minAge={query.minAge}
          maxAge={query.maxAge}
          myInterestIds={myInterestIds}
          onChanged={loadAll}
        />
      ) : status === 'loading' ? (
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
          {peopleResult.hasNextPage && (
            <button
              type="button"
              className="secondary-button show-more-button"
              disabled={peopleResult.isFetchingNextPage}
              onClick={() => peopleResult.fetchNextPage()}
            >
              {peopleResult.isFetchingNextPage ? 'Hämtar...' : 'Visa fler'}
            </button>
          )}
        </>
      ) : (
        <div className="card-grid card-grid-compact">
          {tab === 'contacts' &&
            contactsData.contacts.map((contact) => (
              <PersonCard
                key={contact.id}
                person={contact.user}
                sharedInterestIds={myInterestIds}
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
