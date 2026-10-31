import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import FormField from '../FormField'
import LocationPicker from '../LocationPicker'
import Modal from '../Modal'
import TextareaWithCount from '../TextareaWithCount'
import InvitePicker from './InvitePicker'
import { EVENT_VISIBILITY, createEvent, inviteToEvent, updateEvent } from '../../services/events'
import { SCOPES, SKILL_LEVELS, areaOptions, getRegions } from '../../services/groups'

// Hur man kommer med (SCRUM-296). Öppet och Ansökan går inte i en privat klubb.
const VISIBILITY_OPTIONS = [
  { value: EVENT_VISIBILITY.inviteOnly, label: 'Bara inbjudna', hint: 'Syns bara för dem du bjuder in.' },
  { value: EVENT_VISIBILITY.open, label: 'Öppet', hint: 'Syns för alla, och alla kan svara.' },
  { value: EVENT_VISIBILITY.application, label: 'Ansökan', hint: 'Syns för alla, och du godkänner vem som får vara med.' },
]

// Ett event kan valfritt gälla ett större område (SCRUM-295); kommun finns inte, eftersom eventet redan hör till
// sin plats.
const EVENT_SCOPES = SCOPES.filter((s) => s.value !== 'kommun')
import { profileQuery } from '../../services/profile'

// Värdet ett <input type="datetime-local"> vill ha: lokal tid utan tidszon.
function localInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// "2 personer och 1 klubb", eller en kort uppmaning om inget är valt än.
function inviteSummary({ userIds, groupIds }) {
  const parts = []
  if (userIds.length > 0) parts.push(`${userIds.length} ${userIds.length === 1 ? 'medlem' : 'medlemmar'}`)
  if (groupIds.length > 0) parts.push(`${groupIds.length} ${groupIds.length === 1 ? 'klubb' : 'klubbar'}`)
  return parts.length > 0 ? `${parts.join(' och ')} valda. Skickas när eventet har skapats.` : 'Valfritt.'
}

// Formulärets fält för ett befintligt event, i den form fälten vill ha.
function fieldsFrom(event) {
  return {
    title: event.title,
    description: event.description,
    interestId: String(event.interest_id),
    startsAt: localInputValue(new Date(event.starts_at)),
    endsAt: event.ends_at ? localInputValue(new Date(event.ends_at)) : '',
    placeName: event.place_name,
    address: event.address,
    position:
      event.latitude != null && event.longitude != null ? { latitude: event.latitude, longitude: event.longitude } : null,
    scope: event.scope ?? '',
    areaCode: event.scope && event.scope !== 'country' ? event.scope_code : '',
    skillLevel: event.skill_level ?? '',
    maxAttendees: event.max_attendees ? String(event.max_attendees) : '',
  }
}

const EMPTY_FIELDS = {
  title: '',
  description: '',
  interestId: '',
  startsAt: '',
  endsAt: '',
  placeName: '',
  address: '',
  position: null,
  scope: '',
  areaCode: '',
  skillLevel: '',
  maxAttendees: '',
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
// Ett nytt event kan ha intresset förvalt (`initialInterestId`, från "Det finns inga events för … Vill du skapa ett?").
function CreateEventForm({
  event = null,
  interests,
  groups,
  contacts,
  initialGroupId = null,
  initialInterestId = null,
  onCreated,
  onSaved,
  onCancel,
}) {
  const editing = event !== null
  const initial = useMemo(
    () => (event ? fieldsFrom(event) : { ...EMPTY_FIELDS, interestId: initialInterestId ? String(initialInterestId) : '' }),
    [event, initialInterestId],
  )
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [interestId, setInterestId] = useState(initial.interestId)
  const [startsAt, setStartsAt] = useState(initial.startsAt)
  const [endsAt, setEndsAt] = useState(initial.endsAt)
  const [placeName, setPlaceName] = useState(initial.placeName)
  const [address, setAddress] = useState(initial.address)
  // Var på kartan: { latitude, longitude } eller null (se LocationPicker).
  const [position, setPosition] = useState(initial.position)
  // Ens egen kommun, som kartan visar innan nålen är satt (profilen finns redan
  // i det delade minnet, se services/queryClient.js).
  const { data: profile } = useQuery(profileQuery)
  // Klubben kan vara vald från början (när man skapar ett event från en klubbs sida).
  const [groupId, setGroupId] = useState(initialGroupId ? String(initialGroupId) : '')
  const [visibility, setVisibility] = useState(EVENT_VISIBILITY.inviteOnly)
  // Område, nivå och max antal (SCRUM-293, SCRUM-295), valfria.
  const [scope, setScope] = useState(initial.scope)
  const [areaCode, setAreaCode] = useState(initial.areaCode)
  const [skillLevel, setSkillLevel] = useState(initial.skillLevel)
  const [maxAttendees, setMaxAttendees] = useState(initial.maxAttendees)
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
    if (interestId !== initial.interestId) changes.interest_id = Number(interestId)
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
        interest_id: Number(interestId),
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
    <form className="auth-form form-wide form-compact form-split" onSubmit={handleSubmit}>
      <h2>{editing ? 'Redigera event' : 'Skapa event'}</h2>
      {editing && (
        <p className="hint-text">
          Ändrar du tid eller plats får de som har svarat Ja eller Kanske en notis från Intresseklubben.
        </p>
      )}

      {/* Vad och när till vänster, var (med kartan) och vem det är till för till höger. */}
      <div className="form-columns">
        <div className="form-column">
          <FormField id="event-title" label="Titel">
            <input
              id="event-title"
              className="field-large"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              required
            />
          </FormField>

          <FormField id="event-description" label="Beskrivning">
            <TextareaWithCount
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={800}
              rows={4}
              required
            />
          </FormField>

          <FormField id="event-interest" label="Intresse">
            <select id="event-interest" value={interestId} onChange={(e) => setInterestId(e.target.value)} required>
              <option value="">Välj...</option>
              {interests.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="form-row">
            <FormField id="event-starts-at" label="Start">
              <input
                id="event-starts-at"
                type="datetime-local"
                value={startsAt}
                // En ny tid måste vara framåt. En oförändrad tid på ett event som
                // redan har börjat ska inte stoppa att resten sparas.
                min={!editing || startsAt !== initial.startsAt ? localInputValue(new Date()) : undefined}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </FormField>
            <FormField id="event-ends-at" label="Slut (valfritt)">
              <input
                id="event-ends-at"
                type="datetime-local"
                value={endsAt}
                min={startsAt || localInputValue(new Date())}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </FormField>
          </div>
          {!editing && (
            <>
              <FormField id="event-group" label="Klubb (valfritt)">
                <select id="event-group" value={groupId} onChange={(e) => handleGroupChange(e.target.value)}>
                  <option value="">Ingen klubb</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <fieldset className="form-choice">
                <legend>Vem kan vara med?</legend>
                {VISIBILITY_OPTIONS.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="event-visibility"
                      value={option.value}
                      checked={(inPrivateGroup ? EVENT_VISIBILITY.inviteOnly : visibility) === option.value}
                      disabled={inPrivateGroup && option.value !== EVENT_VISIBILITY.inviteOnly}
                      onChange={() => setVisibility(option.value)}
                    />{' '}
                    <strong>{option.label}</strong> <span className="hint-text">{option.hint}</span>
                  </label>
                ))}
                {inPrivateGroup && <p className="hint-text">Events i privata klubbar är alltid bara för inbjudna.</p>}
              </fieldset>
            </>
          )}

          {/* Valfritt område, nivå och max antal (SCRUM-293, SCRUM-295). Går att ändra senare. */}
          <div className="form-row">
            <FormField id="event-scope" label="Gäller ett större område (valfritt)">
              <select
                id="event-scope"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value)
                  setAreaCode('')
                }}
              >
                <option value="">Nej, platsen räcker</option>
                {EVENT_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FormField>
            {scope && scope !== 'country' && (
              <FormField id="event-area" label={SCOPES.find((s) => s.value === scope)?.label}>
                <select id="event-area" value={areaCode} onChange={(e) => setAreaCode(e.target.value)} required>
                  <option value="">Välj...</option>
                  {areaOptions(scope, regions).map((a) => (
                    <option key={a.kod} value={a.kod}>
                      {a.namn}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
          </div>
          <div className="form-row">
            <FormField id="event-skill-level" label="Nivå (valfritt)">
              <select id="event-skill-level" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
                <option value="">Ingen angiven</option>
                {SKILL_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="event-max-attendees" label="Max antal som kommer (valfritt)">
              <input
                id="event-max-attendees"
                type="number"
                inputMode="numeric"
                min={2}
                max={1000}
                value={maxAttendees}
                onChange={(e) => setMaxAttendees(e.target.value)}
                placeholder="Ingen gräns"
              />
            </FormField>
          </div>
        </div>
        <div className="form-column">
          <div className="form-row">
            <FormField id="event-place" label="Plats">
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
  
            <FormField id="event-address" label="Gatuadress">
              <input
                id="event-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="T.ex. Slottsskogsvallen 1"
                maxLength={100}
                required
              />
            </FormField>
          </div>
          <LocationPicker
            id="event-position"
            // Adressen först, sedan platsens namn (t.ex. "Slottsskogen").
            queries={[address, placeName]}
            value={position}
            onChange={setPosition}
            // Nålen bestämmer adressen: den närmaste gatuadressen skrivs i fältet.
            onAddressFound={setAddress}
            saveLabel={editing ? 'Spara' : 'Skapa event'}
            kommunCode={profile?.municipality_code}
          />
          {!editing && (
            <>
              <div className="detail-view-section">
                <button type="button" className="secondary-button button-small" onClick={() => setInviteOpen(true)}>
                  Bjud in
                </button>
                <p className="hint-text">{inviteSummary(invites)}</p>
                <label>
                  <input type="checkbox" checked={guestsCanInvite} onChange={(e) => setGuestsCanInvite(e.target.checked)} /> Gäster får
                  bjuda in
                </label>
                <p className="hint-text">Utan bockning kan bara du bjuda in. Du kan ändra det senare.</p>
              </div>
              {inviteOpen && (
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
            </>
          )}
        </div>
      </div>

      {error && <p className="status-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {editing ? (saving ? 'Sparar...' : 'Spara') : saving ? 'Skapar...' : 'Skapa event'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  )
}

export default CreateEventForm
