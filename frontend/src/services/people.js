import { apiDelete, apiGet, apiPost } from './api'
import { SECOND, invalidate, queryClient } from './queryClient'

export const PEOPLE_KEY = ['people']

// Andra användare med sparad profil, valfritt filtrerade på intresse, kommun,
// kön och ålder. Med kön kommer bara de som själva valt att synas då.
// Tidigare borttagna förslag (se nedan) är redan uteslutna av backend.
// Sparas i minnet en kort stund per filter (se queryClient.js).
export function peopleQuery({ interestId, municipalityCode, gender, minAge, maxAge } = {}) {
  const params = new URLSearchParams()
  if (interestId) params.set('interest_id', interestId)
  if (municipalityCode) params.set('municipality_code', municipalityCode)
  if (gender) params.set('gender', gender)
  if (minAge != null) params.set('min_age', minAge)
  if (maxAge != null) params.set('max_age', maxAge)
  const query = params.toString()
  return {
    queryKey: [...PEOPLE_KEY, query],
    queryFn: () => apiGet(`/users/${query ? `?${query}` : ''}`),
    staleTime: 15 * SECOND,
  }
}

export function getPeople(filters) {
  return queryClient.fetchQuery(peopleQuery(filters))
}

// Döljer en person från Förslag. Permanent tills man nollställer (se nedan).
export async function dismissSuggestion(userId) {
  const result = await apiPost(`/users/${userId}/dismiss`)
  invalidate(PEOPLE_KEY)
  return result
}

// Visar alla tidigare borttagna förslag igen.
export async function resetDismissedSuggestions() {
  const result = await apiDelete('/users/dismissed-suggestions')
  invalidate(PEOPLE_KEY)
  return result
}
