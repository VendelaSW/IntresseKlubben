import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DemoBackLink } from '../../components/DemoCards'
import { hasProfile, useDemo } from '../../hooks/useDemo'
import { DEMO_INTERESTS, DEMO_MUNICIPALITIES } from '../../services/demoData'

function DemoProfile() {
  const { username, profile, saveProfile } = useDemo()
  const isNew = !hasProfile(profile)
  const navigate = useNavigate()

  const [name, setName] = useState(profile.name || username)
  const [municipality, setMunicipality] = useState(profile.municipality)
  const [district, setDistrict] = useState(profile.district)
  const [interests, setInterests] = useState(profile.interests)
  const [error, setError] = useState('')

  function toggleInterest(interest) {
    setInterests((current) =>
      current.includes(interest) ? current.filter((i) => i !== interest) : [...current, interest],
    )
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (interests.length === 0) {
      setError('Välj minst ett intresse, annars kan vi inte hitta någon att matcha dig med.')
      return
    }
    saveProfile({ name: name.trim(), municipality, district: district.trim(), interests })
    navigate('/demo/app')
  }

  return (
    <div className="page">
      <DemoBackLink to={isNew ? '/demo' : '/demo/app'} />
      <h1>{isNew ? 'Skapa din profil' : 'Redigera profil'}</h1>
      {isNew && (
        <p className="profile-intro">
          Berätta lite om dig själv så hittar vi personer och klubbar nära dig med samma intressen.
        </p>
      )}
      <form className="auth-form demo-profile-form" onSubmit={handleSubmit}>
        <label htmlFor="demo-name">Namn</label>
        <input id="demo-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required />

        <label htmlFor="demo-municipality">Kommun</label>
        <select
          id="demo-municipality"
          value={municipality}
          onChange={(e) => setMunicipality(e.target.value)}
          required
        >
          <option value="">Välj...</option>
          {DEMO_MUNICIPALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label htmlFor="demo-district">Stadsdel (valfritt)</label>
        <input id="demo-district" type="text" value={district} onChange={(e) => setDistrict(e.target.value)} maxLength={100} />

        <fieldset className="demo-fieldset">
          <legend>Intressen</legend>
          <p className="hint-text">Klicka för att välja. Ju fler du väljer, desto fler matchningar.</p>
          <ul className="tags">
            {DEMO_INTERESTS.map((interest) => {
              const selected = interests.includes(interest)
              return (
                <li key={interest}>
                  <button
                    type="button"
                    className={`tag${selected ? ' tag-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest}
                  </button>
                </li>
              )
            })}
          </ul>
        </fieldset>

        {error && <p className="status-error">{error}</p>}

        <button type="submit">{isNew ? 'Kom igång' : 'Spara'}</button>
      </form>
    </div>
  )
}

export default DemoProfile
