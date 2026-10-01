import { useCallback, useEffect, useState } from 'react'
import PersonCard from '../components/PersonCard'
import { getAllInterests } from '../services/interests'
import { getMunicipalities } from '../services/profile'
import { getPeople } from '../services/people'

// Lista över andra användare, filtrerad på intresse och/eller kommun.
// Sidstrukturen (app-section/app-title/card-grid) följer prototypen i
// pages/demo/DemoPeople.jsx - det är den tilltänkta designen för sidan.
function PeoplePage() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [people, setPeople] = useState([])
  const [filters, setFilters] = useState({ interestId: '', municipalityCode: '' })
  const [interests, setInterests] = useState([])
  const [municipalities, setMunicipalities] = useState([])

  useEffect(() => {
    getAllInterests().then(setInterests).catch(() => setStatus('error'))
    getMunicipalities().then(setMunicipalities).catch(() => setStatus('error'))
  }, [])

  const loadPeople = useCallback(() => getPeople(filters).then(setPeople), [filters])

  useEffect(() => {
    loadPeople()
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'))
  }, [filters, loadPeople])

  if (status === 'error') {
    return (
      <div className="content-stack">
        <p className="status-error">Kunde inte hämta personerna. Försök igen senare.</p>
      </div>
    )
  }

  return (
    <div className="content-stack">
      <section className="app-section">
        <h1 className="app-title">Personer</h1>

        <div className="filter-select-row">
          <select
            aria-label="Filtrera på intresse"
            value={filters.interestId}
            onChange={(e) => setFilters({ ...filters, interestId: e.target.value })}
          >
            <option value="">Alla intressen</option>
            {interests.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrera på kommun"
            value={filters.municipalityCode}
            onChange={(e) => setFilters({ ...filters, municipalityCode: e.target.value })}
          >
            <option value="">Alla kommuner</option>
            {municipalities.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {status === 'loading' ? (
          <p className="hint-text">Laddar personer...</p>
        ) : people.length > 0 ? (
          <div className="card-grid">
            {people.map((person) => (
              <PersonCard key={person.username} person={person} />
            ))}
          </div>
        ) : (
          <p className="hint-text">Inga användare hittades.</p>
        )}
      </section>
    </div>
  )
}

export default PeoplePage
