import { useState } from 'react'
import FormField from '../FormField'
import LocationPicker from '../LocationPicker'
import MunicipalityPicker from '../MunicipalityPicker'
import { VISIBILITY, createGroup } from '../../services/groups'

// `initialName` och `initialInterestId` (valfria): det man sökte på när det inte
// fanns någon klubb (SCRUM-221), ifyllt från början.
function CreateGroupForm({
  interests,
  municipalities,
  defaultMunicipality,
  initialName = '',
  initialInterestId = null,
  onCreated,
  onCancel,
}) {
  const [name, setName] = useState(initialName)
  const [interestId, setInterestId] = useState(initialInterestId ? String(initialInterestId) : '')
  const [municipalityCode, setMunicipalityCode] = useState(defaultMunicipality ?? '')
  const [meetingInfo, setMeetingInfo] = useState('')
  // Valfri träffplats: namn, adress och var på kartan (se LocationPicker).
  const [placeName, setPlaceName] = useState('')
  const [address, setAddress] = useState('')
  const [position, setPosition] = useState(null)
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [membersCanInvite, setMembersCanInvite] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const kommunName = municipalities.find((m) => m.code === municipalityCode)?.name

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const group = await createGroup({
        name,
        description,
        meeting_info: meetingInfo,
        place_name: placeName,
        address,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
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
    <form className="auth-form form-wide form-compact form-split" onSubmit={handleSubmit}>
      <h2>Skapa klubb</h2>

      {/* Om klubben till vänster, var den träffas (med kartan) till höger. */}
      <div className="form-columns">
        <div className="form-column">
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
              <MunicipalityPicker
                id="group-municipality"
                municipalities={municipalities}
                value={municipalityCode}
                onChange={setMunicipalityCode}
                required
              />
            </FormField>
          </div>

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

          <label>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Privat klubb
            (syns bara för medlemmar)
          </label>

          <label>
            <input type="checkbox" checked={membersCanInvite} onChange={(e) => setMembersCanInvite(e.target.checked)} />{' '}
            Medlemmar får bjuda in
          </label>
          <p className="hint-text">Utan bockning kan bara du bjuda in.</p>
        </div>
        <div className="form-column">
          <div className="form-row">
            <FormField id="group-place" label="Träffplats (valfritt)">
              <input
                id="group-place"
                type="text"
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                placeholder="T.ex. Stadsbiblioteket"
                maxLength={100}
              />
            </FormField>
            <FormField id="group-address" label="Adress (valfritt)">
              <input
                id="group-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="T.ex. Storgatan 1"
                maxLength={100}
              />
            </FormField>
          </div>

          <LocationPicker
            id="group-position"
            // Adressen först, sedan platsens namn, med kommunen så att "Storgatan 1"
            // hamnar i rätt stad. Utan kommun om det inte hittas så.
            queries={[
              address && kommunName ? `${address}, ${kommunName}` : address,
              placeName && kommunName ? `${placeName}, ${kommunName}` : placeName,
              address,
            ]}
            value={position}
            onChange={setPosition}
            // Nålen bestämmer adressen: den närmaste gatuadressen skrivs i fältet.
            onAddressFound={setAddress}
            saveLabel="Skapa klubb"
            kommunCode={municipalityCode}
          />
        </div>
      </div>

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
