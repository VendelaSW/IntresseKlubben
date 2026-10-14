// När man senast tittade på Events (sidan i appen eller blocket på kartan),
// per användare och sparat i webbläsaren. Events i ens klubbar som skapats
// efter det räknas som nya i märket vid Events (se useBadgeCounts).
//
// Första gången sätts tiden till nu, så att alla klubbars befintliga events
// inte dyker upp som nya. Går det inte att spara (t.ex. privat läge) gäller
// tiden tills sidan laddas om.
const key = (userId) => `events-sedda:${userId}`
const remembered = new Map()

// Skickas när man har tittat på Events, så att märket räknas om direkt.
export const EVENTS_SEEN = 'events-seen'

export function eventsSeenAt(userId) {
  try {
    const stored = Number(window.localStorage.getItem(key(userId)))
    if (stored > 0) return stored
  } catch {
    // Se ovan.
  }
  if (!remembered.has(userId)) save(userId, Date.now())
  return remembered.get(userId)
}

function save(userId, time) {
  remembered.set(userId, time)
  try {
    window.localStorage.setItem(key(userId), String(time))
  } catch {
    // Se ovan.
  }
}

export function markEventsSeen(userId) {
  save(userId, Date.now())
  window.dispatchEvent(new Event(EVENTS_SEEN))
}
