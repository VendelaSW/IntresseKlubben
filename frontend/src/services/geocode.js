import { apiGet } from './api'

// Adressökning (GET /geocode, se backend/app/api/routes/geocode.py): upp till
// fem platser i Sverige, [{ label, latitude, longitude }].
export function searchPlaces(query) {
  return apiGet(`/geocode?q=${encodeURIComponent(query)}`)
}
