import { apiGet } from './api'

// Nivåerna som backend skickar (`level`, se LEVELS i backend/app/services/matching.py) och vad appen kallar dem. Appen visar
// bara nivån, aldrig procenten.
export const MATCH_LEVELS = {
  super: 'SUPERmatch',
  strong: 'Stark match',
  good: 'Bra match',
  okay: 'Okej match',
}

// Så många förslag hämtas åt gången (backend tillåter 1-50). Kortet visas ett i taget, så en handfull räcker.
export const MATCH_PAGE_SIZE = 10

// En sida förslag, bäst först (GET /matches), för den som är inloggad. `offset` är hur många som hoppas över i listan, och
// filtren (kommun, kön och ålder) fungerar som i Sök. Svaret är { status, missing_interests, missing_chars, matches, has_more }:
// status 'not_ready' betyder att man själv har för lite i sin profil för att matchas, och då är matches tom. Sparas inte i
// minnet: förslagen ska vara färska, och ordningen ändras när man själv skickar eller tar bort någon.
export function getMatches({ offset = 0, municipalityCode, gender, minAge, maxAge } = {}) {
  const params = new URLSearchParams({ limit: MATCH_PAGE_SIZE, offset })
  if (municipalityCode) params.set('municipality_code', municipalityCode)
  if (gender) params.set('gender', gender)
  if (minAge != null) params.set('min_age', minAge)
  if (maxAge != null) params.set('max_age', maxAge)
  return apiGet(`/matches?${params}`)
}
