import { ApiError, apiDelete, apiGet, apiPut } from './api'
import { HOUR, MINUTE, cached, cachedInBrowser, queryClient } from './queryClient'

export const MY_INTERESTS_KEY = ['my-interests']

// Alla intressen man kan välja bland, platt (för filter och formulär).
// Biblioteket ändras bara när det synkas, så det sparas i webbläsaren en timme
// (se queryClient.js).
export function getAllInterests() {
  return cachedInBrowser(['interests', 'all'], () => apiGet('/interests/'), HOUR)
}

// Intressebiblioteket: huvudområdena, underintressena till ett intresse, och
// sökning i namn och alias. Varje intresse har path (namnen ovanför det i
// trädet) och has_children (om det går att klicka sig vidare ner).
export function getTopInterests() {
  return cached(['interests', 'top'], () => apiGet('/interests/top'), HOUR)
}

export function getChildInterests(id) {
  return cached(['interests', 'children', id], () => apiGet(`/interests/${id}/children`), HOUR)
}

export function searchInterests(query) {
  return apiGet(`/interests/search?${new URLSearchParams({ q: query })}`)
}

// Tom lista om användaren inte finns än, så att profilsidan ändå kan visas.
// Sparas i minnet som profilen (se getProfile).
export function getMyInterests() {
  return cached(
    MY_INTERESTS_KEY,
    async () => {
      try {
        return await apiGet('/profile/interests')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return []
        throw err
      }
    },
    5 * MINUTE,
  )
}

// Båda returnerar användarens uppdaterade lista med intressen, som också
// ersätter den i minnet.
export async function addInterest(id) {
  return queryClient.setQueryData(MY_INTERESTS_KEY, await apiPut(`/profile/interests/${id}`))
}

export async function removeInterest(id) {
  return queryClient.setQueryData(MY_INTERESTS_KEY, await apiDelete(`/profile/interests/${id}`))
}
