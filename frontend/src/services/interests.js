import { ApiError, apiDelete, apiGet, apiPut } from './api'

// Alla intressen man kan välja bland.
export function getAllInterests() {
  return apiGet('/interests/')
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
