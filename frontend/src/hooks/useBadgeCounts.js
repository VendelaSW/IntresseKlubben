import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { getBadges } from '../services/badges'
import { INVITATIONS_CHANGED } from '../services/groups'
import { countUnseenConversations } from '../services/messages'

// Hur ofta siffrorna räknas om medan man står kvar.
const POLL_MS = 30000

export const EMPTY_COUNTS = { contactRequests: 0, clubInvitations: 0, eventInvitations: 0, unseenMessages: 0 }

// Siffrorna för appens märken (menyn i AppShell och lapparna på kartan):
//   contactRequests: obesvarade kontaktförfrågningar (Personer)
//   clubInvitations: klubbar man är inbjuden till (Klubbar)
//   eventInvitations: events man är inbjuden till och inte har svarat på (Events)
//   unseenMessages: konversationer med nya brev, samma som fliken Nya på Brev
//     (Brev). `openConversationId` är konversationen man har öppen; den räknas
//     inte, eftersom chatten själv markerar den som sedd.
//
// Räknas om när `refreshKey` ändras (t.ex. vid sidbyte), när man har gått med
// i eller avböjt en klubb, och var POLL_MS, så att något nytt syns utan att
// man gör något. Pausar när fliken inte syns och räknar om direkt när man
// kommer tillbaka. Anropen är låsta tills profilen är klar (require_profile i
// backend), så inget hämtas innan dess.
//
// Alla fyra kommer i ett anrop (GET /users/me/badges), så att en omräkning
// inte blir fyra anrop som var och en kan råka ut för en kallstart.
//
// Ger null tills första hämtningen är klar, så att den som jämför siffror
// (kartans lappar studsar när en går upp) inte tar de första riktiga
// siffrorna för en ökning från noll. Alla fyra sätts på en gång.
export function useBadgeCounts({ refreshKey = null, openConversationId = null } = {}) {
  const { user } = useAuth()
  const profileDone = Boolean(user?.profile_completed)
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
        eventInvitations: badges.event_invitations,
        unseenMessages: countUnseenConversations(badges.conversations.filter((c) => c.id !== openConversationId)),
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
    const timer = setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener(INVITATIONS_CHANGED, refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener(INVITATIONS_CHANGED, refresh)
    }
  }, [refreshKey, openConversationId, profileDone])

  return counts
}
