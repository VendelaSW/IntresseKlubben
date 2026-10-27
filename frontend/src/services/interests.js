import { ApiError, apiDelete, apiGet, apiPost, apiPut } from './api'
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
//
// Ett huvudområde utan underintressen (t.ex. Övrigt och nischat tills något hamnat där) är en tom kategori som inte betyder
// något för andra, så det syns varken under Utforska eller i sökningen. Så fort det får underintressen visas det igen.
function hasContent(interest) {
  return interest.path.length > 0 || interest.has_children
}

export function getTopInterests() {
  return cached(['interests', 'top'], () => apiGet('/interests/top').then((items) => items.filter(hasContent)), HOUR)
}

export function getChildInterests(id) {
  return cached(['interests', 'children', id], () => apiGet(`/interests/${id}/children`), HOUR)
}

export function searchInterests(query) {
  return apiGet(`/interests/search?${new URLSearchParams({ q: query })}`).then((items) => items.filter(hasContent))
}

// "Menade du": högst tre intressen med liknande betydelse som texten, för när sökningen inte gav någon träff ("vara ute i
// naturen" ger Friluftsliv, "pokmon" ger Pokémon TCG). Samma form som searchInterests. Tom lista om inget liknar eller om
// det inte gick att räkna ut. Kostar ett litet anrop hos backend, så anropa den bara efter en sökning utan träff.
export function similarInterests(query) {
  return apiGet(`/interests/similar?${new URLSearchParams({ q: query })}`)
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

// Alla tre returnerar användarens uppdaterade lista med intressen, som också
// ersätter den i minnet.
export async function addInterest(id) {
  return queryClient.setQueryData(MY_INTERESTS_KEY, await apiPut(`/profile/interests/${id}`))
}

export async function removeInterest(id) {
  return queryClient.setQueryData(MY_INTERESTS_KEY, await apiDelete(`/profile/interests/${id}`))
}

// Om man själv håller på med intresset (utövar) eller bara är intresserad (SCRUM-271).
export async function setPractices(id, practices) {
  return queryClient.setQueryData(
    MY_INTERESTS_KEY,
    await apiPut(`/profile/interests/${id}/practices`, { practices }),
  )
}

// Ett enda intresse med egna ord (högst 40 tecken) som inte finns i biblioteket. Backend kontrollerar det (ordfilter,
// moderation, granskning), kopplar det till ett intresse som finns eller väljer en förälder, och svarar med
// { token, proposals, followups }, där token är sigillet (skickas oförändrat till confirmInterests eller intervjun).
// Fel: 422 om intresset inte godkänns ("Detta intresse godkänns inte, försök med ett annat."), 503 om kontrollen inte
// gick att köra, 429 vid för många försök.
export function suggestInterest(text) {
  return apiPost('/interests/suggest', { text })
}

// Sparar ett godkänt förslag (från suggestInterest) på en profil som redan finns, och ger användarens uppdaterade lista.
// Svaret från backend saknar parent_id (en annan form än listan på profilen), så listan hämtas om i stället för att skrivas
// in, annars hamnar ett nytt intresse överst och inte under sin förälder. Fel: 400 om sigillet har gått ut (30 minuter),
// 429 om man lagt till för många egna intressen i dag.
export async function confirmInterests(result) {
  const items = result.proposals.map((p) => (p.activity ? { key: p.key, activity: p.activity } : { key: p.key }))
  await apiPost('/profile/interests/confirm', { batches: [{ token: result.token, items }] })
  return cached(MY_INTERESTS_KEY, () => apiGet('/profile/interests'), 0)
}

// Ett befintligt intresse som valts ur sökningen får ett sigill utifrån sitt id (inte sitt namn, eftersom flera intressen kan
// heta samma sak), utan några AI-anrop. Intervjun behöver det, eftersom den bara sparar förslag med sigill. Svaret har samma
// form som suggestInterest. Fel: 422 om intresset inte finns.
export function sealInterest(interest) {
  return apiPost('/interests/suggest', { interest_id: interest.id })
}

