import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { getContacts } from '../services/contacts'
import { getEvents } from '../services/events'
import { EVENTS_SEEN, eventsSeenAt } from '../services/eventsSeen'
import { INVITATIONS_CHANGED, getGroupInvitationCount } from '../services/groups'
import { countUnseenConversations, getConversations } from '../services/messages'

// Hur ofta siffrorna räknas om medan man står kvar.
const POLL_MS = 30000

export const EMPTY_COUNTS = { contactRequests: 0, clubInvitations: 0, eventNews: 0, unseenMessages: 0 }

// Siffrorna för appens märken (menyn i AppShell och lapparna på kartan):
//   contactRequests: obesvarade kontaktförfrågningar (Personer)
//   clubInvitations: klubbar man är inbjuden till (Klubbar)
//   eventNews: events man inte har svarat på och som antingen är en inbjudan,
//     eller är nya i en av ens klubbar sedan man senast tittade på Events (se
//     services/eventsSeen.js). Ens egna och de som redan är slut räknas inte.
//     (Events)
//   unseenMessages: konversationer med nya brev, samma som fliken Nya på Brev
//     (Brev). `openConversationId` är konversationen man har öppen; den räknas
//     inte, eftersom chatten själv markerar den som sedd.
//
// Räknas om när `refreshKey` ändras (t.ex. vid sidbyte), när man har gått med
// i eller avböjt en klubb, när man har tittat på Events, och var POLL_MS, så att något nytt syns utan att
// man gör något. Pausar när fliken inte syns och räknar om direkt när man
// kommer tillbaka. Anropen är låsta tills profilen är klar (require_profile i
// backend), så inget hämtas innan dess.
//
// Events som är nya för en: obesvarade inbjudningar, och obesvarade events i
// ens klubbar som har skapats sedan `seenAt` (se eventNews ovan).
function countEventNews(events, seenAt) {
  const now = Date.now()
  return events.filter((e) => {
    if (e.my_answer !== null || e.is_owner) return false
    if (new Date(e.ends_at ?? e.starts_at).getTime() < now) return false
    return e.is_invited || (e.group_id != null && new Date(e.created_at).getTime() > seenAt)
  }).length
}

// Ger null tills första hämtningen är klar, så att den som jämför siffror
// (kartans lappar studsar när en går upp) inte tar de första riktiga
// siffrorna för en ökning från noll. Alla fyra sätts på en gång.
export function useBadgeCounts({ refreshKey = null, openConversationId = null } = {}) {
  const { user } = useAuth()
  const profileDone = Boolean(user?.profile_completed)
  const userId = user?.id
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    if (!profileDone) return undefined
    let cancelled = false
    let fetching = false

    async function refresh() {
      if (fetching || document.hidden) return
      fetching = true
      const results = await Promise.allSettled([
        getContacts().then((data) => data.incoming_requests.length),
        getGroupInvitationCount(),
        getEvents().then((events) => countEventNews(events, eventsSeenAt(userId))),
        getConversations().then((conversations) =>
          countUnseenConversations(conversations.filter((c) => c.id !== openConversationId)),
        ),
      ])
      fetching = false
      if (cancelled) return
      // Ett anrop som misslyckas behåller sin förra siffra (0 första gången),
      // så att det inte nollar de andra. Siffrorna är inte viktiga nog för ett
      // felmeddelande; nästa försök kommer snart.
      const keys = ['contactRequests', 'clubInvitations', 'eventNews', 'unseenMessages']
      setCounts((current) => {
        const next = { ...(current ?? EMPTY_COUNTS) }
        results.forEach((result, i) => {
          if (result.status === 'fulfilled') next[keys[i]] = result.value
        })
        const same = current && keys.every((key) => current[key] === next[key])
        return same ? current : next
      })
    }

    function onVisibilityChange() {
      if (!document.hidden) refresh()
    }

    refresh()
    const timer = setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener(INVITATIONS_CHANGED, refresh)
    window.addEventListener(EVENTS_SEEN, refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener(INVITATIONS_CHANGED, refresh)
      window.removeEventListener(EVENTS_SEEN, refresh)
    }
  }, [refreshKey, openConversationId, profileDone, userId])

  return counts
}
