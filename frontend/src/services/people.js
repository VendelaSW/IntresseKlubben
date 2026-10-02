import { apiDelete, apiGet, apiPost } from './api'

// Andra användare med sparad profil, valfritt filtrerade på intresse och kommun.
// Tidigare borttagna förslag (se nedan) är redan uteslutna av backend.
export function getPeople({ interestId, municipalityCode } = {}) {
  const params = new URLSearchParams()
  if (interestId) params.set('interest_id', interestId)
  if (municipalityCode) params.set('municipality_code', municipalityCode)
  const query = params.toString()
  return apiGet(`/users/${query ? `?${query}` : ''}`)
}

// Döljer en person från Förslag. Permanent tills man nollställer (se nedan).
export function dismissSuggestion(username) {
  return apiPost(`/users/${encodeURIComponent(username)}/dismiss`)
}

// Visar alla tidigare borttagna förslag igen.
export function resetDismissedSuggestions() {
  return apiDelete('/users/dismissed-suggestions')
}
