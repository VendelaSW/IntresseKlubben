import { apiDelete, apiGet, apiPost } from './api'
import { MINUTE, SECOND, cached, invalidate } from './queryClient'

export const PEOPLE_KEY = ['people']

// Sök visar så här många förslag åt gången, med "Visa fler" för nästa (SCRUM-321).
const PEOPLE_PAGE_SIZE = 20

// Andra användare med sparad profil, valfritt filtrerade på intresse, kommun,
// kön och ålder. Med kön kommer bara de som själva valt att synas då.
// Tidigare borttagna förslag (se nedan), kompisar och inkommande förfrågningar
// är redan uteslutna av backend. Hämtas en sida i taget (useInfiniteQuery):
// varje sida har en person extra, så att det syns om det finns fler, och den
// visas först på nästa sida (se peoplePages). Sparas i minnet en kort stund per
// filter (se queryClient.js).
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
    queryFn: ({ pageParam }) => {
      const page = new URLSearchParams(params)
      page.set('limit', PEOPLE_PAGE_SIZE + 1)
      page.set('offset', pageParam)
      return apiGet(`/users/?${page}`)
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length > PEOPLE_PAGE_SIZE ? allPages.length * PEOPLE_PAGE_SIZE : undefined,
    staleTime: 15 * SECOND,
  }
}

// Personerna på de sidor som har hämtats, utan den extra på varje sida.
export function peoplePages(data) {
  return data ? data.pages.flatMap((page) => page.slice(0, PEOPLE_PAGE_SIZE)) : []
}

// Hur många andra användare som finns per område, för kartan (SCRUM-82): { kommun, landskap, lan }, med kommunkod,
// landskapskod och "landskap:län" som nycklar. null betyder färre än 5, och ett område där ingen finns saknas.
export function getAreaCounts() {
  return cached([...PEOPLE_KEY, 'area-counts'], () => apiGet('/users/area-counts'), 5 * MINUTE)
}

// Döljer en person från Förslag. Permanent tills man nollställer (se nedan).
export async function dismissSuggestion(userId) {
  const result = await apiPost(`/users/${userId}/dismiss`)
  invalidate(PEOPLE_KEY)
  return result
}

// Ångrar att en person togs bort från Förslag ("Ångra" direkt efteråt).
export async function undoDismissSuggestion(userId) {
  const result = await apiDelete(`/users/${userId}/dismiss`)
  invalidate(PEOPLE_KEY)
  return result
}

// Hur många personer man har tagit bort från Förslag ({ count }). Under
// PEOPLE_KEY, så att den räknas om när man tar bort eller nollställer.
export const dismissedCountQuery = {
  queryKey: [...PEOPLE_KEY, 'dismissed'],
  queryFn: () => apiGet('/users/dismissed-suggestions'),
  staleTime: 15 * SECOND,
}

// Visar alla tidigare borttagna förslag igen.
export async function resetDismissedSuggestions() {
  const result = await apiDelete('/users/dismissed-suggestions')
  invalidate(PEOPLE_KEY)
  return result
}
