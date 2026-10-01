import { apiGet } from './api'

// Andra användare med sparad profil, valfritt filtrerade på intresse och kommun.
export function getPeople({ interestId, municipalityCode } = {}) {
  const params = new URLSearchParams()
  if (interestId) params.set('interest_id', interestId)
  if (municipalityCode) params.set('municipality_code', municipalityCode)
  const query = params.toString()
  return apiGet(`/users/${query ? `?${query}` : ''}`)
}
