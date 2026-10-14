import { QueryClient } from '@tanstack/react-query'

// Delat minne för data från backend (TanStack Query). Samma data hämtas då
// bara en gång, även när flera komponenter ber om den samtidigt (profilen
// hämtas t.ex. av både kartan och profilrutan), och en sida man redan har
// besökt öppnas direkt med det som redan finns.
//
// Servicefunktionerna (getProfile, getMunicipalities osv.) använder minnet via
// `cached` nedan, så sidorna anropar dem precis som förut. Det som ändrar
// datan (spara profilen, lägga till ett intresse) uppdaterar minnet direkt,
// och allt töms vid in- och utloggning, så att ingen ser någon annans data.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ett fel visas av sidan som anropade, precis som innan minnet fanns.
      retry: false,
      // Minnet behålls en stund efter att ingen sida använder det.
      gcTime: 30 * 60 * 1000,
    },
  },
})

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE

// Hämtar `key` med `fetcher`, eller ger det som redan finns i minnet om det är
// yngre än `staleTime`. Pågår redan en hämtning av samma sak väntar man på den.
export function cached(key, fetcher, staleTime) {
  return queryClient.fetchQuery({ queryKey: key, queryFn: fetcher, staleTime })
}

// Det som är likadant för alla användare och sällan ändras (kommunerna,
// intressebiblioteket) sparas också i webbläsaren, så att det inte behöver
// hämtas igen vid nästa besök eller omladdning. Går det inte att spara (t.ex.
// privat läge) hämtas det som vanligt.
const STORAGE_PREFIX = 'cache:'

export function cachedInBrowser(key, fetcher, staleTime) {
  const storageKey = STORAGE_PREFIX + key.join(':')
  if (queryClient.getQueryData(key) === undefined) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey))
      if (saved && Date.now() - saved.savedAt < staleTime) {
        queryClient.setQueryData(key, saved.data, { updatedAt: saved.savedAt })
      }
    } catch {
      // Inget sparat, eller inte läsbart: hämtas nedan.
    }
  }
  return cached(
    key,
    async () => {
      const data = await fetcher()
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), data }))
      } catch {
        // Fullt eller avstängt: minnet räcker.
      }
      return data
    },
    staleTime,
  )
}

// Säger att det som ligger under `keys` kan ha ändrats. Det hämtas om direkt
// om en sida visar det just nu, och annars nästa gång någon ber om det.
export function invalidate(...keys) {
  for (const key of keys) queryClient.invalidateQueries({ queryKey: key })
}

// Töms vid in- och utloggning. Det som sparats i webbläsaren är samma för alla
// och får ligga kvar.
export function clearCache() {
  queryClient.clear()
}
