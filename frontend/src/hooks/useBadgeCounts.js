import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { isIdle, onUserActive } from '../services/activity'
import { getBadges } from '../services/badges'
import { EVENTS_SEEN, eventsSeenAt } from '../services/eventsSeen'
import { INVITATIONS_CHANGED } from '../services/groups'
import { MESSAGES_READ } from '../services/messages'
import { NOTIFICATIONS_READ } from '../services/notifications'

// Hur ofta siffrorna räknas om medan man står kvar. De räknas också om vid
// varje sidbyte, så de behöver inte hämtas oftare än så här.
const POLL_MS = 60000

// Siffrorna för appens märken (lapparna på kartan):
//   contactRequests: obesvarade kompisförfrågningar (Personer)
//   clubInvitations: klubbar man är inbjuden till (Klubbar)
//   eventNews: events man inte har svarat på som antingen är en inbjudan, eller
//     är nya i en av ens klubbar sedan man senast tittade på Events (se
//     services/eventsSeen.js). Ens egna och de som redan är slut räknas inte.
//     (Events)
//   unseenMessages: konversationer med brev man inte har läst, samma som
//     fliken Nya på Brev (Brev). Räknas på servern, så siffran är densamma på
//     alla enheter.
//   notifications: olästa notiser från Intresseklubben, t.ex. att ett event man
//     skulle gå på har ställts in (Notiser).
//
// Räknas om när `refreshKey` ändras (t.ex. vid sidbyte), när man har gått med
// i eller avböjt en klubb, när man har tittat på Events, läst brev eller notiser, och var POLL_MS, så att något nytt syns utan att
// man gör något. Pausar när fliken inte syns eller ingen har rört appen på
// ett tag (se services/activity.js), och räknar om direkt när man kommer
// tillbaka. Anropen är låsta tills profilen är klar (require_profile i
// backend), så inget hämtas innan dess.
//
// Alla fyra kommer i ett anrop (GET /users/me/badges), så att en omräkning
// inte blir fyra anrop som var och en kan råka ut för en kallstart.
//
// Hur många av klubbarnas events ([{ id, created_at }]) som har skapats sedan
// `seenAt`, när man senast tittade på Events.
const countNew = (clubEvents, seenAt) => clubEvents.filter((e) => new Date(e.created_at).getTime() > seenAt).length

// Ger null tills första hämtningen är klar, så att den som jämför siffror
// (kartans lappar studsar när en går upp) inte tar de första riktiga
// siffrorna för en ökning från noll. Alla fyra sätts på en gång.
export function useBadgeCounts({ refreshKey = null } = {}) {
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
      let badges
      try {
        badges = await getBadges()
      } catch {
        // Misslyckas anropet behålls de förra siffrorna. Siffrorna är inte
        // viktiga nog för ett felmeddelande; nästa försök kommer snart.
        return
      } finally {
        fetching = false
      }
      if (cancelled) return
      const next = {
        contactRequests: badges.contact_requests,
        clubInvitations: badges.club_invitations,
        // Klubbarnas events kommer utan inbjudningarna (de räknas redan), så
        // inget räknas två gånger.
        eventNews: badges.event_invitations + countNew(badges.club_events, eventsSeenAt(userId)),
        unseenMessages: badges.unread_conversations,
        notifications: badges.unread_notifications,
      }
      setCounts((current) => {
        const same = current && Object.keys(next).every((key) => current[key] === next[key])
        return same ? current : next
      })
    }

    function onVisibilityChange() {
      if (!document.hidden) refresh()
    }

    refresh()
    const timer = setInterval(() => isIdle() || refresh(), POLL_MS)
    const stopListening = onUserActive(refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener(INVITATIONS_CHANGED, refresh)
    window.addEventListener(EVENTS_SEEN, refresh)
    window.addEventListener(MESSAGES_READ, refresh)
    window.addEventListener(NOTIFICATIONS_READ, refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      stopListening()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener(INVITATIONS_CHANGED, refresh)
      window.removeEventListener(EVENTS_SEEN, refresh)
      window.removeEventListener(MESSAGES_READ, refresh)
      window.removeEventListener(NOTIFICATIONS_READ, refresh)
    }
  }, [refreshKey, profileDone, userId])

  return counts
}
