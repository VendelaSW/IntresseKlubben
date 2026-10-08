import { useState } from 'react'
import FormField from '../FormField'
import { VISIBILITY, createGroup } from '../../services/groups'

function CreateGroupForm({ interests, municipalities, defaultMunicipality, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [interestId, setInterestId] = useState('')
  const [municipalityCode, setMunicipalityCode] = useState(defaultMunicipality ?? '')
  const [meetingInfo, setMeetingInfo] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [membersCanInvite, setMembersCanInvite] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const group = await createGroup({
        name,
        description,
        meeting_info: meetingInfo,
        interest_id: Number(interestId),
        municipality_code: municipalityCode,
        visibility: isPrivate ? VISIBILITY.private : VISIBILITY.public,
        members_can_invite: membersCanInvite,
      })
      onCreated(group)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="auth-form form-wide form-compact" onSubmit={handleSubmit}>
      <h2>Skapa klubb</h2>

      <FormField id="group-name" label="Namn">
        <input
          id="group-name"
          className="field-large"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          required
        />
      </FormField>

      <div className="form-row">
        <FormField id="group-interest" label="Intresse">
          <select id="group-interest" value={interestId} onChange={(e) => setInterestId(e.target.value)} required>
            <option value="">Välj...</option>
            {interests.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="group-municipality" label="Kommun">
          <select
            id="group-municipality"
            value={municipalityCode}
            onChange={(e) => setMunicipalityCode(e.target.value)}
            required
          >
            <option value="">Välj...</option>
            {municipalities.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField id="group-meeting-info" label="När och var träffas ni? (valfritt)">
        <input
          id="group-meeting-info"
          type="text"
          value={meetingInfo}
          onChange={(e) => setMeetingInfo(e.target.value)}
          placeholder="T.ex. onsdagar 18.00 på biblioteket"
          maxLength={100}
        />
      </FormField>

      <FormField id="group-description" label="Beskrivning">
        <input
          id="group-description"
          className="field-large"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          required
        />
      </FormField>

      <label>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Privat klubb
        (syns bara för medlemmar)
      </label>

      <label>
        <input type="checkbox" checked={membersCanInvite} onChange={(e) => setMembersCanInvite(e.target.checked)} />{' '}
        Medlemmar får bjuda in
      </label>
      <p className="hint-text">Utan bockning kan bara du bjuda in.</p>

      {error && <p className="status-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Skapar...' : 'Skapa klubb'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  )
}

export default CreateGroupForm
