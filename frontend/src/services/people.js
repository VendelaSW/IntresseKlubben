import { apiDelete, apiGet, apiPost } from './api'

// Andra användare med sparad profil, valfritt filtrerade på intresse, kommun,
// kön och ålder. Med kön kommer bara de som själva valt att synas då.
// Tidigare borttagna förslag (se nedan) är redan uteslutna av backend.
export function getPeople({ interestId, municipalityCode, gender, minAge, maxAge } = {}) {
  const params = new URLSearchParams()
  if (interestId) params.set('interest_id', interestId)
  if (municipalityCode) params.set('municipality_code', municipalityCode)
  if (gender) params.set('gender', gender)
  if (minAge != null) params.set('min_age', minAge)
  if (maxAge != null) params.set('max_age', maxAge)
  const query = params.toString()
  return apiGet(`/users/${query ? `?${query}` : ''}`)
}

// Döljer en person från Förslag. Permanent tills man nollställer (se nedan).
export function dismissSuggestion(userId) {
  return apiPost(`/users/${userId}/dismiss`)
}

// Visar alla tidigare borttagna förslag igen.
export function resetDismissedSuggestions() {
  return apiDelete('/users/dismissed-suggestions')
}
