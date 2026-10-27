import { useEffect, useState } from 'react'
import FormField from '../FormField'
import LocationPicker from '../LocationPicker'
import MunicipalityPicker from '../MunicipalityPicker'
import { SCOPES, SKILL_LEVELS, VISIBILITY, createGroup, getRegions } from '../../services/groups'

// Hur nya medlemmar kommer in (SCRUM-159).
const VISIBILITY_OPTIONS = [
  { value: VISIBILITY.public, label: 'Öppen', hint: 'Alla kan gå med direkt.' },
  { value: VISIBILITY.application, label: 'Ansökan', hint: 'Man ansöker, och du godkänner nya medlemmar.' },
  { value: VISIBILITY.private, label: 'Privat', hint: 'Syns bara för medlemmar. Man kommer in med en inbjudan.' },
]

// Områdena att välja bland för en räckvidd (inte kommun och hela Sverige, som
// har en egen väljare respektive inget val), som [{ kod, namn }].
function areaOptions(scope, regions) {
  if (!regions) return []
  if (scope === 'lan') return regions.lan
  if (scope === 'landskap') return [...regions.landskap].sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
  if (scope === 'landsdel') return regions.landsdelar
  return []
}

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
  // Räckvidden (SCRUM-282): förvalt kommun. För län, landskap och landsdel väljs området i `areaCode`.
  const [scope, setScope] = useState('kommun')
  const [areaCode, setAreaCode] = useState('')
  const [regions, setRegions] = useState(null)
  const [skillLevel, setSkillLevel] = useState('')
  const [maxMembers, setMaxMembers] = useState('')
  const [meetingInfo, setMeetingInfo] = useState('')
  // Valfri träffplats: namn, adress och var på kartan (se LocationPicker).
  const [placeName, setPlaceName] = useState('')
  const [address, setAddress] = useState('')
  const [position, setPosition] = useState(null)
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState(VISIBILITY.public)
  const [membersCanInvite, setMembersCanInvite] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch(() => setRegions(null))
  }, [])

  const kommunName = scope === 'kommun' ? municipalities.find((m) => m.code === municipalityCode)?.name : undefined
  const areas = areaOptions(scope, regions)

  function chooseScope(next) {
    setScope(next)
    setAreaCode('')
  }

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
        scope,
        ...(scope === 'kommun' ? { municipality_code: municipalityCode } : { scope_code: areaCode || null }),
        visibility,
        members_can_invite: membersCanInvite,
        skill_level: skillLevel || null,
        max_members: maxMembers ? Number(maxMembers) : null,
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

          {/* Var klubben gäller: en kommun (förvalt), ett län, ett landskap, en landsdel eller hela Sverige. */}
          <div className="form-row">
            <FormField id="group-scope" label="Klubben gäller">
              <select id="group-scope" value={scope} onChange={(e) => chooseScope(e.target.value)}>
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FormField>
            {scope === 'kommun' ? (
              <FormField id="group-municipality" label="Kommun">
                <MunicipalityPicker
                  id="group-municipality"
                  municipalities={municipalities}
                  value={municipalityCode}
                  onChange={setMunicipalityCode}
                  required
                />
              </FormField>
            ) : scope !== 'country' ? (
              <FormField id="group-area" label={SCOPES.find((s) => s.value === scope)?.label}>
                <select id="group-area" value={areaCode} onChange={(e) => setAreaCode(e.target.value)} required>
                  <option value="">Välj...</option>
                  {areas.map((a) => (
                    <option key={a.kod} value={a.kod}>
                      {a.namn}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
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

          <fieldset className="form-choice">
            <legend>Hur kommer man med?</legend>
            {VISIBILITY_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="group-visibility"
                  value={option.value}
                  checked={visibility === option.value}
                  onChange={() => setVisibility(option.value)}
                />{' '}
                <strong>{option.label}</strong> <span className="hint-text">{option.hint}</span>
              </label>
            ))}
          </fieldset>

          <div className="form-row">
            <FormField id="group-skill-level" label="Nivå (valfritt)">
              <select id="group-skill-level" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
                <option value="">Ingen angiven</option>
                {SKILL_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="group-max-members" label="Max antal medlemmar (valfritt)">
              <input
                id="group-max-members"
                type="number"
                inputMode="numeric"
                min={2}
                max={1000}
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="Ingen gräns"
              />
            </FormField>
          </div>

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
            // Kartan börjar i klubbens kommun, eller i ens egen när klubben gäller ett större område.
            kommunCode={scope === 'kommun' ? municipalityCode : defaultMunicipality}
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
