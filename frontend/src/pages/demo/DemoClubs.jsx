import { useState } from 'react'
import { ClubCard } from '../../components/DemoCards'
import { useDemo } from '../../hooks/useDemo'
import { DEMO_INTERESTS, DEMO_MUNICIPALITIES } from '../../services/demoData'

function CreateClubForm({ onDone }) {
  const { profile, createClub } = useDemo()
  const [name, setName] = useState('')
  const [interest, setInterest] = useState(profile.interests[0] ?? '')
  const [municipality, setMunicipality] = useState(profile.municipality)
  const [meets, setMeets] = useState('')
  const [description, setDescription] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    createClub({ name: name.trim(), interest, municipality, meets: meets.trim(), description: description.trim() })
    onDone()
  }

  return (
    <form className="auth-form card demo-create-form" onSubmit={handleSubmit}>
      <h2>Starta en klubb</h2>

      <label htmlFor="club-name">Namn</label>
      <input id="club-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />

      <label htmlFor="club-interest">Intresse</label>
      <select id="club-interest" value={interest} onChange={(e) => setInterest(e.target.value)} required>
        {DEMO_INTERESTS.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>

      <label htmlFor="club-municipality">Kommun</label>
      <select id="club-municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} required>
        {DEMO_MUNICIPALITIES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <label htmlFor="club-meets">När och var träffas ni? (valfritt)</label>
      <input
        id="club-meets"
        type="text"
        value={meets}
        onChange={(e) => setMeets(e.target.value)}
        placeholder="T.ex. onsdagar 18.00 på biblioteket"
        maxLength={100}
      />

      <label htmlFor="club-description">Beskrivning</label>
      <input
        id="club-description"
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
        required
      />

      <button type="submit">Skapa klubb</button>
      <button type="button" className="button-secondary" onClick={onDone}>
        Avbryt
      </button>
    </form>
  )
}

function DemoClubs() {
  const { profile, clubs } = useDemo()
  const [creating, setCreating] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)

  // Klubbar som matchar dina intressen först.
  const sorted = [...clubs].sort(
    (a, b) => Number(profile.interests.includes(b.interest)) - Number(profile.interests.includes(a.interest)),
  )
  const shown = onlyMine ? sorted.filter((c) => c.joined) : sorted

  return (
    <section className="app-section">
      <div className="section-header">
        <h1 className="app-title">Klubbar</h1>
        {!creating && (
          <button type="button" className="primary-button" onClick={() => setCreating(true)}>
            Starta en klubb
          </button>
        )}
      </div>

      {creating && <CreateClubForm onDone={() => setCreating(false)} />}

      <div className="filter-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!onlyMine} className={`tag${!onlyMine ? ' tag-selected' : ''}`} onClick={() => setOnlyMine(false)}>
          Alla ({clubs.length})
        </button>
        <button type="button" role="tab" aria-selected={onlyMine} className={`tag${onlyMine ? ' tag-selected' : ''}`} onClick={() => setOnlyMine(true)}>
          Mina ({clubs.filter((c) => c.joined).length})
        </button>
      </div>

      {shown.length > 0 ? (
        <div className="card-grid">
          {shown.map((club) => (
            <ClubCard key={club.id} club={club} highlight={profile.interests} />
          ))}
        </div>
      ) : (
        <p className="hint-text">Du är inte med i någon klubb än.</p>
      )}
    </section>
  )
}

export default DemoClubs
