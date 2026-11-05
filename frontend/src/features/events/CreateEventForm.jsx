import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import eventIcon from '../../assets/event.png'
import ChoiceButtons from '../../shared/ChoiceButtons'
import DateField from '../../shared/DateField'
import FormField, { RequiredNote } from '../../shared/FormField'
import FormSection from '../../shared/FormSection'
import InputWithCount from '../../shared/InputWithCount'
import InterestPicker from '../interests/InterestPicker'
import { LocationMap } from '../../shared/LocationPicker'
import LocationSearch from '../../shared/LocationSearch'
import Modal from '../../shared/Modal'
import NumberStepper from '../../shared/NumberStepper'
import TextareaWithCount from '../../shared/TextareaWithCount'
import InvitePicker from './InvitePicker'
import { useFitToHeight } from '../../hooks/useFitToHeight'
import { useLocationPicker } from '../../hooks/useLocationPicker'
import { EVENT_VISIBILITY, createEvent, inviteToEvent, updateEvent } from '../../services/events'
import { SCOPES, SKILL_LEVELS, areaOptions, getRegions } from '../../services/groups'
import { profileQuery } from '../../services/profile'
import { localInputValue } from '../../utils/eventTime'
import InfoTip from '../../shared/InfoTip'
import IconButton from '../../shared/IconButton'
import { LetterIcon, LockIcon } from '../../shared/AccessIcons'

// Hur man kommer med (SCRUM-296), med samma färger och ikoner som i klubbformuläret. Öppet och Ansökan går inte i
// en privat klubb.
const VISIBILITY_OPTIONS = [
  {
    value: EVENT_VISIBILITY.inviteOnly,
    label: 'Bara inbjudna',
    info: 'Syns bara för dem du bjuder in.',
    icon: <LockIcon />,
    tone: 'lilac',
  },
  {
    value: EVENT_VISIBILITY.open,
    label: 'Öppet',
    info: 'Syns för alla, och alla kan svara.',
    icon: <LockIcon open />,
    tone: 'green',
  },
  {
    value: EVENT_VISIBILITY.application,
    label: 'Ansökan',
    info: 'Syns för alla, och du godkänner vem som får vara med.',
    icon: <LetterIcon />,
    tone: 'peach',
  },
]

// Ett event kan valfritt gälla ett större område (SCRUM-295); kommun finns inte, eftersom eventet redan hör till
// sin plats.
const EVENT_SCOPES = SCOPES.filter((s) => s.value !== 'kommun')

// Räckvidden som svar på "Gäller ett större område?" ("I ett län"), och frågan om vilket område det är.
const SCOPE_CHOICES = {
  lan: 'I ett län',
  landskap: 'I ett landskap',
  landsdel: 'I en landsdel',
  country: 'I hela Sverige',
}
const AREA_QUESTIONS = { lan: 'Vilket län?', landskap: 'Vilket landskap?', landsdel: 'Vilken landsdel?' }

// Nivåerna med "Alla nivåer" först, eftersom det är förvalt (som i klubbformuläret).
const ALL_LEVELS = 'all_levels'
const SKILL_CHOICES = [
  ...SKILL_LEVELS.filter((l) => l.value === ALL_LEVELS),
  ...SKILL_LEVELS.filter((l) => l.value !== ALL_LEVELS),
]

// "2 personer och 1 klubb", eller inget om inget är valt än.
function inviteSummary({ userIds, groupIds }) {
  const parts = []
  if (userIds.length > 0) parts.push(`${userIds.length} ${userIds.length === 1 ? 'medlem' : 'medlemmar'}`)
  if (groupIds.length > 0) parts.push(`${groupIds.length} ${groupIds.length === 1 ? 'klubb' : 'klubbar'}`)
  return parts.length > 0 ? `${parts.join(' och ')} valda. Skickas när eventet har skapats.` : ''
}

// Formulärets fält för ett befintligt event, i den form fälten vill ha.
function fieldsFrom(event) {
  return {
    title: event.title,
    description: event.description,
    interest: { id: event.interest_id, name: event.interest_name },
    startsAt: localInputValue(new Date(event.starts_at)),
    endsAt: event.ends_at ? localInputValue(new Date(event.ends_at)) : '',
    placeName: event.place_name,
    address: event.address,
    position:
      event.latitude != null && event.longitude != null ? { latitude: event.latitude, longitude: event.longitude } : null,
    scope: event.scope ?? '',
    areaCode: event.scope && event.scope !== 'country' ? event.scope_code : '',
    skillLevel: event.skill_level ?? ALL_LEVELS,
    maxAttendees: event.max_attendees ? String(event.max_attendees) : '',
    creatorInMax: event.creator_in_max ?? true,
  }
}

const EMPTY_FIELDS = {
  title: '',
  description: '',
  interest: null,
  startsAt: '',
  endsAt: '',
  placeName: '',
  address: '',
  position: null,
  scope: '',
  areaCode: '',
  skillLevel: ALL_LEVELS,
  maxAttendees: '',
  creatorInMax: true,
}

const samePosition = (a, b) =>
  (a?.latitude ?? null) === (b?.latitude ?? null) && (a?.longitude ?? null) === (b?.longitude ?? null)

// Formuläret för att skapa ett event, eller med `event` för att redigera det
// (bara skaparen ser Redigera, se EventDetails). Ett nytt event är alltid "endast
// inbjudna" om man inte väljer att göra det öppet, och ett event i en privat
// klubb kan inte vara öppet (backend avvisar det, här stängs valet av).
// Tiden skickas som ISO med tidszon, tolkad som webbläsarens lokala tid.
// "Bjud in" öppnar samma popup som på eventets egen vy. Valen sparas bara här, och
// inbjudningarna skickas direkt efter att eventet har skapats.
// Vid redigering kan titel, beskrivning, intresse, tid, plats och nålen ändras.
// Klubb och synlighet går inte att ändra, och inbjudningar och "Gäster får bjuda
// in" sköts i eventets vy. Bara det som har ändrats skickas: backend vägrar en
// starttid som har passerat, och ett event som redan har börjat ska ändå kunna
// få t.ex. en ny beskrivning.
// Ett nytt event kan ha intresset förvalt (`initialInterest`, { id, name }, från "Det finns inga events för … Vill du
// skapa ett?"). `myInterests` är snabbvalen i intresseväljaren.
function CreateEventForm({
  event = null,
  myInterests,
  groups,
  contacts,
  initialGroupId = null,
  initialInterest = null,
  onCreated,
  onSaved,
  onCancel,
  onDelete,
}) {
  const editing = event !== null
  const initial = useMemo(
    () => (event ? fieldsFrom(event) : { ...EMPTY_FIELDS, interest: initialInterest }),
    [event, initialInterest],
  )
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [interest, setInterest] = useState(initial.interest)
  const [startsAt, setStartsAt] = useState(initial.startsAt)
  const [endsAt, setEndsAt] = useState(initial.endsAt)
  const [placeName, setPlaceName] = useState(initial.placeName)
  const [address, setAddress] = useState(initial.address)
  // Var på kartan: { latitude, longitude } eller null (se useLocationPicker).
  const [position, setPosition] = useState(initial.position)
  // Ens egen kommun, som kartan visar innan nålen är satt (profilen finns redan
  // i det delade minnet, se services/queryClient.js).
  const { data: profile } = useQuery(profileQuery)
  // Var på kartan: sökknappen ligger bredvid adressfältet och kartan bredvid, så de delar på det här.
  const picker = useLocationPicker({
    // Adressen först, sedan platsens namn (t.ex. "Slottsskogen").
    queries: [address, placeName],
    value: position,
    onChange: setPosition,
    // Nålen bestämmer adressen: den närmaste gatuadressen skrivs i fältet.
    onAddressFound: setAddress,
  })
  // Bara ägaren och administratörer skapar event för en klubb (SCRUM-326).
  const clubsToCreateFor = groups.filter((g) => g.is_owner || g.is_admin)
  // Klubben kan vara vald från början (när man skapar ett event från en klubbs sida).
  const [chosenGroupId, setGroupId] = useState(initialGroupId ? String(initialGroupId) : '')
  // Klubbarna kan laddas efter att formuläret öppnats, så valet kontrolleras här i stället för när det görs.
  const groupId = clubsToCreateFor.some((g) => String(g.id) === chosenGroupId) ? chosenGroupId : ''
  const [visibility, setVisibility] = useState(EVENT_VISIBILITY.inviteOnly)
  // Område, nivå och max antal (SCRUM-293, SCRUM-295), valfria.
  const [scope, setScope] = useState(initial.scope)
  const [areaCode, setAreaCode] = useState(initial.areaCode)
  // Har man bytt område? Då lyser frågan om vilket upp (inte när formuläret öppnas).
  const [scopeChanged, setScopeChanged] = useState(false)
  const [skillLevel, setSkillLevel] = useState(initial.skillLevel)
  const [maxAttendees, setMaxAttendees] = useState(initial.maxAttendees)
  // Räknas mitt eget Ja in i maxantalet (som standard), eller gäller det bara gästerna?
  const [creatorInMax, setCreatorInMax] = useState(initial.creatorInMax)
  const [regions, setRegions] = useState(null)
  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch(() => setRegions(null))
  }, [])
  const [guestsCanInvite, setGuestsCanInvite] = useState(false)
  const [invites, setInvites] = useState({ userIds: [], groupIds: [] })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const group = groups.find((g) => String(g.id) === groupId)
  const inPrivateGroup = group?.visibility === 'private'

  function chooseScope(next) {
    setScope(next)
    setAreaCode('')
    setScopeChanged(true)
  }

  function handleGroupChange(value) {
    setGroupId(value)
    const chosen = groups.find((g) => String(g.id) === value)
    if (chosen?.visibility === 'private') setVisibility(EVENT_VISIBILITY.inviteOnly)
  }

  // Det som har ändrats jämfört med eventet, i den form PATCH /events/{id} vill ha.
  function changedFields() {
    const changes = {}
    if (title !== initial.title) changes.title = title
    if (description !== initial.description) changes.description = description
    if (interest.id !== initial.interest.id) changes.interest_id = interest.id
    if (startsAt !== initial.startsAt) changes.starts_at = new Date(startsAt).toISOString()
    if (endsAt !== initial.endsAt) changes.ends_at = endsAt ? new Date(endsAt).toISOString() : null
    if (placeName !== initial.placeName) changes.place_name = placeName
    if (address !== initial.address) changes.address = address
    if (!samePosition(position, initial.position)) {
      changes.latitude = position?.latitude ?? null
      changes.longitude = position?.longitude ?? null
    }
    if (scope !== initial.scope || areaCode !== initial.areaCode) Object.assign(changes, areaFields())
    if (skillLevel !== initial.skillLevel) changes.skill_level = skillLevel || null
    if (maxAttendees !== initial.maxAttendees) changes.max_attendees = maxAttendees ? Number(maxAttendees) : null
    if (creatorInMax !== initial.creatorInMax) changes.creator_in_max = creatorInMax
    return changes
  }

  // Området i den form backend vill ha: inget, hela Sverige, eller en nivå med en kod.
  function areaFields() {
    if (!scope) return { scope: null }
    if (scope === 'country') return { scope }
    return { scope, scope_code: areaCode || null }
  }

  async function handleSave() {
    const changes = changedFields()
    onSaved(Object.keys(changes).length > 0 ? await updateEvent(event.id, changes) : event)
  }

  // Hela formuläret krymps lite på låga datorskärmar, så att det alltid får plats utan att man scrollar.
  const formRef = useRef(null)
  useFitToHeight(formRef)

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault()
    setSaving(true)
    setError('')
    if (editing) {
      try {
        await handleSave()
      } catch (err) {
        setError(err.message)
        setSaving(false)
      }
      return
    }
    try {
      const created = await createEvent({
        title,
        description,
        interest_id: interest.id,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        place_name: placeName,
        address,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        visibility: inPrivateGroup ? EVENT_VISIBILITY.inviteOnly : visibility,
        group_id: groupId ? Number(groupId) : null,
        guests_can_invite: guestsCanInvite,
        ...areaFields(),
        skill_level: skillLevel || null,
        max_attendees: maxAttendees ? Number(maxAttendees) : null,
        creator_in_max: creatorInMax,
      })
      let inviteProblem = ''
      if (invites.userIds.length + invites.groupIds.length > 0) {
        try {
          await inviteToEvent(created.id, invites)
        } catch (err) {
          inviteProblem = err.message
        }
      }
      onCreated(created, inviteProblem)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    // Som en affisch, i samma stil som klubbformuläret (se .form-poster i index.css).
    <form
      ref={formRef}
      className="auth-form form-wide form-compact form-split form-fit form-poster"
      onSubmit={handleSubmit}
    >
      <div className="form-header">
        {/* Rubriken med eventikonen som en stämpel bredvid. */}
        <div className="form-poster-title">
          <h2>{editing ? 'Redigera event' : 'Skapa event'}</h2>
          {editing && (
            <InfoTip text="Ändrar du tid eller plats får de som har svarat Ja eller Kanske en notis från Intresseklubben." />
          )}
          <img src={eventIcon} alt="" className="form-poster-stamp" />
        </div>
        <RequiredNote />
      </div>

      <FormSection title="Om eventet" description="Det andra ser först." grow>
        <div className="form-grid">
          <FormField id="event-title" label="Titel" required>
            <InputWithCount
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              required
            />
          </FormField>

          <FormField id="event-interest" label="Intresse" required>
            <InterestPicker
              id="event-interest"
              myInterests={myInterests}
              value={interest}
              onChange={setInterest}
              required
            />
          </FormField>

          {/* När: start och slut hör ihop, i en gemensam ruta med en pil emellan. */}
          <div className="form-grid-wide form-linked">
            <FormField id="event-starts-at" label="Start" required>
              <DateField
                id="event-starts-at"
                withTime
                value={startsAt}
                onChange={setStartsAt}
                // En ny tid måste vara framåt. En oförändrad tid på ett event som
                // redan har börjat ska inte stoppa att resten sparas.
                min={!editing || startsAt !== initial.startsAt ? undefined : null}
                required
              />
            </FormField>
            <span className="form-linked-arrow" aria-hidden="true">
              →
            </span>
            <FormField id="event-ends-at" label="Slut">
              <DateField id="event-ends-at" withTime value={endsAt} onChange={setEndsAt} min={startsAt || undefined} />
            </FormField>
          </div>

          <FormField id="event-description" label="Beskrivning" required className="form-grid-tall">
            <TextareaWithCount
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={800}
              rows={4}
              placeholder="Vad ska ni göra, och vem passar det för?"
              required
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Deltagare" description="Vilka som kan vara med.">
        <div className="form-inline">
          {!editing && clubsToCreateFor.length > 0 && (
            <FormField id="event-group" label="Klubb">
              <select id="event-group" value={groupId} onChange={(e) => handleGroupChange(e.target.value)}>
                <option value="">Ingen klubb</option>
                {clubsToCreateFor.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          {!editing && (
            <ChoiceButtons
              name="event-visibility"
              legend="Vem kan vara med?"
              // Öppet och Ansökan går inte i en privat klubb.
              options={VISIBILITY_OPTIONS.map((option) => ({
                ...option,
                disabled: inPrivateGroup && option.value !== EVENT_VISIBILITY.inviteOnly,
                disabledReason: 'Events i privata klubbar är alltid bara för inbjudna.',
              }))}
              value={inPrivateGroup ? EVENT_VISIBILITY.inviteOnly : visibility}
              onChange={setVisibility}
            />
          )}
          <FormField id="event-skill-level" label="Nivå">
            <select id="event-skill-level" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
              {SKILL_CHOICES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="event-max-attendees" label="Max deltagare">
            <NumberStepper id="event-max-attendees" value={maxAttendees} onChange={setMaxAttendees} min={2} max={1000} />
          </FormField>
        </div>

        <div className="form-inline">
          {/* Med ett maxantal: tar skaparens eget Ja en av platserna, eller är de bara till gästerna? */}
          {maxAttendees && (
            <label>
              <input type="checkbox" checked={creatorInMax} onChange={(e) => setCreatorInMax(e.target.checked)} /> Räkna
              in mig i maxantalet
            </label>
          )}
          {!editing && (
            <>
              <span className="with-info-tip">
                <button type="button" className="button-secondary" onClick={() => setInviteOpen(true)}>
                  Bjud in
                </button>
                {inviteSummary(invites) && <span className="hint-text">{inviteSummary(invites)}</span>}
              </span>
              <span className="with-info-tip">
                <label>
                  <input
                    type="checkbox"
                    checked={guestsCanInvite}
                    onChange={(e) => setGuestsCanInvite(e.target.checked)}
                  />{' '}
                  Gäster får bjuda in
                </label>
                <InfoTip text="Utan bockning kan bara du bjuda in. Du kan ändra det senare." />
              </span>
            </>
          )}
        </div>
        {!editing && inviteOpen && (
          <Modal title="Bjud in" onClose={() => setInviteOpen(false)}>
            <InvitePicker
              contacts={contacts}
              groups={groups}
              initial={invites}
              submitLabel="Klar"
              onSubmit={(selection) => {
                setInvites(selection)
                setInviteOpen(false)
              }}
              onCancel={() => setInviteOpen(false)}
            />
          </Modal>
        )}
      </FormSection>

      <FormSection title="Plats" description="Var ni ses." grow>
        <div className="form-grid">
          <FormField id="event-place" label="Plats" required>
            <input
              id="event-place"
              type="text"
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="T.ex. Slottsskogen"
              maxLength={100}
              required
            />
          </FormField>

          <FormField id="event-address" label="Gatuadress" required>
            {/* Sökningen på kartan hör ihop med adressen, så knapparna ligger direkt till höger om fältet. */}
            <div className="input-with-buttons">
              <input
                id="event-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="T.ex. Slottsskogsvallen 1"
                maxLength={100}
                required
              />
              <LocationSearch picker={picker} />
            </div>
          </FormField>

          {/* Valfritt större område (SCRUM-295): först hur stort, sedan vilket, i en gemensam ruta som i
              klubbformuläret. Den andra frågan lyser upp när man byter, och har en gul ram tills den är besvarad. */}
          <div className="form-grid-wide form-linked">
            <FormField
              id="event-scope"
              label="Gäller ett större område?"
              info="Platsen räcker för de flesta events. Välj ett större område om eventet är för fler än de som bor nära."
            >
              <select id="event-scope" value={scope} onChange={(e) => chooseScope(e.target.value)}>
                <option value="">Nej, platsen räcker</option>
                {EVENT_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {SCOPE_CHOICES[s.value] ?? s.label}
                  </option>
                ))}
              </select>
            </FormField>
            {scope && scope !== 'country' && (
              <>
                <span className="form-linked-arrow" aria-hidden="true">
                  →
                </span>
                <FormField
                  key={scope}
                  id="event-area"
                  label={AREA_QUESTIONS[scope]}
                  required
                  className={scopeChanged ? 'form-linked-flash' : undefined}
                >
                  <select id="event-area" value={areaCode} onChange={(e) => setAreaCode(e.target.value)} required>
                    <option value="">Välj...</option>
                    {areaOptions(scope, regions).map((a) => (
                      <option key={a.kod} value={a.kod}>
                        {a.namn}
                      </option>
                    ))}
                  </select>
                </FormField>
              </>
            )}
          </div>

          <div className="form-grid-tall">
            <LocationMap
              id="event-position"
              picker={picker}
              saveLabel={editing ? 'Spara' : 'Skapa event'}
              kommunCode={profile?.municipality_code}
            />
          </div>
        </div>
      </FormSection>

      {error && <p className="status-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {editing ? (saving ? 'Sparar...' : 'Spara') : saving ? 'Skapar...' : 'Skapa event'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Avbryt
        </button>
        {/* Radera i redigeringsläget, som soptunnan längst till höger (se DeleteEventDialog). */}
        {editing && onDelete && (
          <IconButton icon="delete" label="Radera eventet" className="event-form-delete" onClick={onDelete} />
        )}
      </div>
    </form>
  )
}

export default CreateEventForm
