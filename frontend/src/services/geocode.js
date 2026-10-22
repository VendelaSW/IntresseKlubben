import { apiGet } from './api'

// Adressökning (GET /geocode, se backend/app/api/routes/geocode.py): upp till
// fem platser i Sverige, [{ label, latitude, longitude }].
export function searchPlaces(query) {
  return apiGet(`/geocode?q=${encodeURIComponent(query)}`)
}

// Den närmaste gatuadressen där nålen står (GET /geocode/reverse): "Storgatan 1",
// eller null när det inte finns någon i närheten.
export async function addressAt(latitude, longitude) {
  const { address } = await apiGet(`/geocode/reverse?lat=${latitude}&lon=${longitude}`)
  return address
}
