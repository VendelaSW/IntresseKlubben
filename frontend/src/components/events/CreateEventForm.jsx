import { useState } from 'react'
import FormField from '../FormField'
import Modal from '../Modal'
import TextareaWithCount from '../TextareaWithCount'
import InvitePicker from './InvitePicker'
import { EVENT_VISIBILITY, createEvent, inviteToEvent } from '../../services/events'

// Värdet ett <input type="datetime-local"> vill ha: lokal tid utan tidszon.
function localInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// "2 personer och 1 klubb", eller en kort uppmaning om inget är valt än.
function inviteSummary({ usernames, groupIds }) {
  const parts = []
  if (usernames.length > 0) parts.push(`${usernames.length} ${usernames.length === 1 ? 'person' : 'personer'}`)
  if (groupIds.length > 0) parts.push(`${groupIds.length} ${groupIds.length === 1 ? 'klubb' : 'klubbar'}`)
  return parts.length > 0 ? `${parts.join(' och ')} valda. Skickas när eventet har skapats.` : 'Valfritt.'
}

// Formuläret för att skapa ett event. Ett nytt event är alltid "endast
// inbjudna" om man inte väljer att göra det öppet, och ett event i en privat
// klubb kan inte vara öppet (backend avvisar det, här stängs valet av).
// Tiden skickas som ISO med tidszon, tolkad som webbläsarens lokala tid.
// "Bjud in" öppnar samma popup som på eventets egen vy. Valen sparas bara här, och
// inbjudningarna skickas direkt efter att eventet har skapats.
function CreateEventForm({ interests, groups, contacts, initialGroupId = null, onCreated, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [interestId, setInterestId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [placeName, setPlaceName] = useState('')
  const [address, setAddress] = useState('')
  // Klubben kan vara vald från början (när man skapar ett event från en klubbs sida).
  const [groupId, setGroupId] = useState(initialGroupId ? String(initialGroupId) : '')
  const [isOpen, setIsOpen] = useState(false)
  const [guestsCanInvite, setGuestsCanInvite] = useState(false)
  const [invites, setInvites] = useState({ usernames: [], groupIds: [] })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const group = groups.find((g) => String(g.id) === groupId)
  const inPrivateGroup = group?.visibility === 'private'

  function handleGroupChange(value) {
    setGroupId(value)
    const chosen = groups.find((g) => String(g.id) === value)
    if (chosen?.visibility === 'private') setIsOpen(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const created = await createEvent({
        title,
        description,
        interest_id: Number(interestId),
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        place_name: placeName,
        address,
        visibility: isOpen && !inPrivateGroup ? EVENT_VISIBILITY.open : EVENT_VISIBILITY.inviteOnly,
        group_id: groupId ? Number(groupId) : null,
        guests_can_invite: guestsCanInvite,
      })
      let inviteProblem = ''
      if (invites.usernames.length + invites.groupIds.length > 0) {
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
    <form className="auth-form form-wide form-compact" onSubmit={handleSubmit}>
      <h2>Skapa event</h2>

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
            min={localInputValue(new Date())}
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

      <label>
        <input
          type="checkbox"
          checked={isOpen && !inPrivateGroup}
          disabled={inPrivateGroup}
          onChange={(e) => setIsOpen(e.target.checked)}
        />{' '}
        Öppet event (syns för alla)
      </label>
      <p className="hint-text">
        {inPrivateGroup
          ? 'Events i privata klubbar är alltid bara för inbjudna.'
          : 'Utan bockning syns eventet bara för dem du bjuder in.'}
      </p>

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

      {error && <p className="status-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Skapar...' : 'Skapa event'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  )
}

export default CreateEventForm
