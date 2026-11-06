import { useEffect, useRef, useState } from 'react'
import klubbarIcon from '../../assets/klubbar.png'
import ChoiceButtons from '../../shared/ChoiceButtons'
import FormField, { RequiredNote } from '../../shared/FormField'
import FormSection from '../../shared/FormSection'
import InfoTip from '../../shared/InfoTip'
import InputWithCount from '../../shared/InputWithCount'
import InterestPicker from '../interests/InterestPicker'
import { LocationMap } from '../../shared/LocationPicker'
import LocationSearch from '../../shared/LocationSearch'
import MunicipalityPicker from '../../shared/MunicipalityPicker'
import NumberStepper from '../../shared/NumberStepper'
import TextareaWithCount from '../../shared/TextareaWithCount'
import { useFitToHeight } from '../../hooks/useFitToHeight'
import { useLocationPicker } from '../../hooks/useLocationPicker'
import { SCOPES, SKILL_LEVELS, VISIBILITY, areaOptions, createGroup, getRegions } from '../../services/groups'
import { LetterIcon, LockIcon } from '../../shared/AccessIcons'

// Hur nya medlemmar kommer in (SCRUM-159). Färgerna och hänglåsen som Öppen och Privat på klubbkorten.
const VISIBILITY_OPTIONS = [
  {
    value: VISIBILITY.public,
    label: 'Öppen',
    info: 'Alla kan gå med direkt.',
    icon: <LockIcon open />,
    tone: 'green',
  },
  {
    value: VISIBILITY.application,
    label: 'Ansökan',
    info: 'Man ansöker, och du godkänner nya medlemmar.',
    icon: <LetterIcon />,
    tone: 'peach',
  },
  {
    value: VISIBILITY.private,
    label: 'Privat',
    info: 'Syns bara för medlemmar. Man kommer in med en inbjudan.',
    icon: <LockIcon />,
    tone: 'lilac',
  },
]

// Räckvidden som svar på "Var finns klubben?" ("I en kommun"), och frågan om vilket område det är.
const SCOPE_CHOICES = {
  kommun: 'I en kommun',
  lan: 'I ett län',
  landskap: 'I ett landskap',
  landsdel: 'I en landsdel',
  country: 'I hela Sverige',
}
const AREA_QUESTIONS = { lan: 'Vilket län?', landskap: 'Vilket landskap?', landsdel: 'Vilken landsdel?' }

// Nivåerna med "Alla nivåer" först, eftersom det är förvalt.
const ALL_LEVELS = 'all_levels'
const SKILL_CHOICES = [
  ...SKILL_LEVELS.filter((l) => l.value === ALL_LEVELS),
  ...SKILL_LEVELS.filter((l) => l.value !== ALL_LEVELS),
]

// `initialName` och `initialInterest` ({ id, name }, valfria): det man sökte på när det inte
// fanns någon klubb (SCRUM-221), ifyllt från början. `myInterests` är snabbvalen i intresseväljaren.
function CreateGroupForm({
  myInterests,
  municipalities,
  defaultMunicipality,
  initialName = '',
  initialInterest = null,
  onCreated,
  onCancel,
}) {
  const [name, setName] = useState(initialName)
  const [interest, setInterest] = useState(initialInterest)
  const [municipalityCode, setMunicipalityCode] = useState(defaultMunicipality ?? '')
  // Räckvidden (SCRUM-282): förvalt kommun. För län, landskap och landsdel väljs området i `areaCode`.
  const [scope, setScope] = useState('kommun')
  const [areaCode, setAreaCode] = useState('')
  // Har man bytt område? Då lyser frågan om vilket upp (inte när formuläret öppnas).
  const [scopeChanged, setScopeChanged] = useState(false)
  const [regions, setRegions] = useState(null)
  // Förvalt "Alla nivåer", överst i listan, så att det aldrig står tomt eller både "ingen" och "alla".
  const [skillLevel, setSkillLevel] = useState(ALL_LEVELS)
  const [maxMembers, setMaxMembers] = useState('')
  const [meetingInfo, setMeetingInfo] = useState('')
  // Valfri träffplats: namn, adress och var på kartan (se useLocationPicker).
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
  // Var på kartan: sökknappen ligger under adressfältet och kartan bredvid, så de delar på det här.
  const picker = useLocationPicker({
    // Adressen först, sedan platsens namn, med kommunen så att "Storgatan 1"
    // hamnar i rätt stad. Utan kommun om det inte hittas så.
    queries: [
      address && kommunName ? `${address}, ${kommunName}` : address,
      placeName && kommunName ? `${placeName}, ${kommunName}` : placeName,
      address,
    ],
    value: position,
    onChange: setPosition,
    // Nålen bestämmer adressen: den närmaste gatuadressen skrivs i fältet.
    onAddressFound: setAddress,
  })

  function chooseScope(next) {
    setScope(next)
    setAreaCode('')
    setScopeChanged(true)
  }

  // Hela formuläret krymps lite på låga datorskärmar, så att det alltid får plats utan att man scrollar.
  const formRef = useRef(null)
  useFitToHeight(formRef)

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
        interest_id: interest.id,
        scope,
        ...(scope === 'kommun' ? { municipality_code: municipalityCode } : { scope_code: areaCode || null }),
        visibility,
        members_can_invite: membersCanInvite,
        skill_level: skillLevel,
        max_members: maxMembers ? Number(maxMembers) : null,
      })
      onCreated(group)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    // Som en affisch, i samma stil som klubbkorten (se .form-poster i index.css).
    <form
      ref={formRef}
      className="auth-form form-wide form-compact form-split form-fit form-poster"
      onSubmit={handleSubmit}
    >
      <div className="form-header">
        {/* Rubriken med klubbikonen som en stämpel bredvid, som på klubbkorten. */}
        <div className="form-poster-title">
          <h2>Skapa klubb</h2>
          <img src={klubbarIcon} alt="" className="form-poster-stamp" />
        </div>
        <RequiredNote />
      </div>

      <FormSection title="Om klubben" description="Det andra ser först." grow>
        <div className="form-grid">
          <FormField id="group-name" label="Namn" required>
            <InputWithCount
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              required
            />
          </FormField>

          <FormField id="group-interest" label="Intresse" required>
            <InterestPicker
              id="group-interest"
              myInterests={myInterests}
              value={interest}
              onChange={setInterest}
              required
            />
          </FormField>

          {/* Var klubben gäller: först hur stort område (en kommun, förvalt, ett län, ett landskap, en landsdel eller
              hela Sverige), sedan vilket. Två frågor som hör ihop, i en gemensam ruta med en pil emellan. Den andra
              byter fråga och lyser upp när man byter område, och har en gul ram tills den är besvarad. */}
          <div className="form-grid-wide form-linked">
            <FormField
              id="group-scope"
              label="Var finns klubben?"
              required
              info="Välj kommunen för en klubb på orten, eller ett större område om medlemmarna bor utspritt."
            >
              <select id="group-scope" value={scope} onChange={(e) => chooseScope(e.target.value)}>
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {SCOPE_CHOICES[s.value] ?? s.label}
                  </option>
                ))}
              </select>
            </FormField>
            {scope !== 'country' && (
              <>
                <span className="form-linked-arrow" aria-hidden="true">
                  →
                </span>
                {scope === 'kommun' ? (
                  <FormField
                    key={scope}
                    id="group-municipality"
                    label="Vilken kommun?"
                    required
                    className={scopeChanged ? 'form-linked-flash' : undefined}
                  >
                    <MunicipalityPicker
                      id="group-municipality"
                      municipalities={municipalities}
                      value={municipalityCode}
                      onChange={setMunicipalityCode}
                      required
                    />
                  </FormField>
                ) : (
                  <FormField
                    key={scope}
                    id="group-area"
                    label={AREA_QUESTIONS[scope]}
                    required
                    className={scopeChanged ? 'form-linked-flash' : undefined}
                  >
                    <select id="group-area" value={areaCode} onChange={(e) => setAreaCode(e.target.value)} required>
                      <option value="">Välj...</option>
                      {areas.map((a) => (
                        <option key={a.kod} value={a.kod}>
                          {a.namn}
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
              </>
            )}
          </div>

          <FormField id="group-description" label="Beskrivning" required className="form-grid-tall">
            <TextareaWithCount
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={4}
              placeholder="Vad gör ni, och vem passar klubben för?"
              required
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Medlemmar" description="Vilka som kan vara med.">
        <div className="form-inline">
          <ChoiceButtons
            name="group-visibility"
            legend="Vem får gå med?"
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={setVisibility}
          />
          <FormField id="group-skill-level" label="Nivå">
            <select id="group-skill-level" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
              {SKILL_CHOICES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="group-max-members" label="Max medlemmar">
            <NumberStepper
              id="group-max-members"
              value={maxMembers}
              onChange={setMaxMembers}
              min={2}
              max={1000}
            />
          </FormField>
        </div>

        <div className="with-info-tip">
          <label>
            <input
              type="checkbox"
              checked={membersCanInvite}
              onChange={(e) => setMembersCanInvite(e.target.checked)}
            />{' '}
            Medlemmar får bjuda in
          </label>
          <InfoTip text="Utan bockning kan bara du bjuda in." />
        </div>
      </FormSection>

      <FormSection title="Träffar" description="När och var ni ses." grow>
        <div className="form-grid">
          <FormField id="group-meeting-info" label="När träffas ni?" className="form-grid-wide">
            <input
              id="group-meeting-info"
              type="text"
              value={meetingInfo}
              onChange={(e) => setMeetingInfo(e.target.value)}
              placeholder="T.ex. onsdagar 18.00"
              maxLength={100}
            />
          </FormField>

          <FormField id="group-place" label="Träffplats">
            <input
              id="group-place"
              type="text"
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="T.ex. Biblioteket"
              maxLength={100}
            />
          </FormField>
          <FormField id="group-address" label="Adress">
            {/* Sökningen på kartan hör ihop med adressen, så knapparna ligger direkt till höger om fältet. */}
            <div className="input-with-buttons">
              <input
                id="group-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="T.ex. Storgatan 1"
                maxLength={100}
              />
              <LocationSearch picker={picker} />
            </div>
          </FormField>

          <div className="form-grid-tall">
            <LocationMap
              id="group-position"
              picker={picker}
              saveLabel="Skapa klubb"
              // Kartan börjar i klubbens kommun, eller i ens egen när klubben gäller ett större område.
              kommunCode={scope === 'kommun' ? municipalityCode : defaultMunicipality}
            />
          </div>
        </div>
      </FormSection>

      {error && <p className="status-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Skapar...' : 'Skapa klubb'}
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  )
}

export default CreateGroupForm
