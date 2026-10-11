import { ApiError, apiDelete, apiGet, apiPut } from './api'

// Alla intressen man kan välja bland, platt (för filter och formulär).
export function getAllInterests() {
  return apiGet('/interests/')
}

// Intressebiblioteket: huvudområdena, underintressena till ett intresse, och
// sökning i namn och alias. Varje intresse har path (namnen ovanför det i
// trädet) och has_children (om det går att klicka sig vidare ner).
export function getTopInterests() {
  return apiGet('/interests/top')
}

export function getChildInterests(id) {
  return apiGet(`/interests/${id}/children`)
}

export function searchInterests(query) {
  return apiGet(`/interests/search?${new URLSearchParams({ q: query })}`)
}

// Tom lista om användaren inte finns än, så att profilsidan ändå kan visas.
export async function getMyInterests() {
  try {
    return await apiGet('/profile/interests')
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return []
    throw err
  }
}

// Båda returnerar användarens uppdaterade lista med intressen.
export function addInterest(id) {
  return apiPut(`/profile/interests/${id}`)
}

export function removeInterest(id) {
  return apiDelete(`/profile/interests/${id}`)
}
