import { useState } from 'react'
import { VISIBILITY, createGroup } from '../../services/groups'

function CreateGroupForm({ interests, municipalities, defaultMunicipality, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [interestId, setInterestId] = useState('')
  const [municipalityCode, setMunicipalityCode] = useState(defaultMunicipality ?? '')
  const [meetingInfo, setMeetingInfo] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
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
      })
      onCreated(group)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="auth-form form-wide" onSubmit={handleSubmit}>
      <h2>Skapa klubb</h2>

      <label htmlFor="group-name">Namn</label>
      <input id="group-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required />

      <label htmlFor="group-interest">Intresse</label>
      <select id="group-interest" value={interestId} onChange={(e) => setInterestId(e.target.value)} required>
        <option value="">Välj...</option>
        {interests.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>

      <label htmlFor="group-municipality">Kommun</label>
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

      <label htmlFor="group-meeting-info">När och var träffas ni? (valfritt)</label>
      <input
        id="group-meeting-info"
        type="text"
        value={meetingInfo}
        onChange={(e) => setMeetingInfo(e.target.value)}
        placeholder="T.ex. onsdagar 18.00 på biblioteket"
        maxLength={100}
      />

      <label htmlFor="group-description">Beskrivning</label>
      <input
        id="group-description"
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
        required
      />

      <label>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Privat klubb
        (syns bara för medlemmar)
      </label>

      {error && <p className="status-error">{error}</p>}

      <button type="submit" disabled={saving}>
        {saving ? 'Skapar...' : 'Skapa klubb'}
      </button>
      <button type="button" className="button-secondary" onClick={onCancel}>
        Avbryt
      </button>
    </form>
  )
}

export default CreateGroupForm
