import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { getContacts } from '../services/contacts'
import { getEvents } from '../services/events'
import { INVITATIONS_CHANGED, getGroupInvitationCount } from '../services/groups'
import { countUnseenConversations, getConversations } from '../services/messages'

// Hur ofta siffrorna räknas om medan man står kvar.
const POLL_MS = 30000

const EMPTY = { contactRequests: 0, clubInvitations: 0, eventInvitations: 0, unseenMessages: 0 }

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
export function useBadgeCounts({ refreshKey = null, openConversationId = null } = {}) {
  const { user } = useAuth()
  const profileDone = Boolean(user?.profile_completed)
  const [counts, setCounts] = useState(EMPTY)

  useEffect(() => {
    if (!profileDone) return undefined
    let cancelled = false
    let fetching = false

    // Varje siffra för sig, så att ett anrop som misslyckas inte nollar de
    // andra. Siffrorna är inte viktiga nog för ett felmeddelande; nästa försök
    // kommer snart.
    function update(key, value) {
      if (!cancelled) setCounts((current) => (current[key] === value ? current : { ...current, [key]: value }))
    }

    async function refresh() {
      if (fetching || document.hidden) return
      fetching = true
      await Promise.allSettled([
        getContacts().then((data) => update('contactRequests', data.incoming_requests.length)),
        getGroupInvitationCount().then((count) => update('clubInvitations', count)),
        getEvents().then((events) =>
          update('eventInvitations', events.filter((e) => e.is_invited && e.my_answer === null).length),
        ),
        getConversations().then((conversations) =>
          update('unseenMessages', countUnseenConversations(conversations.filter((c) => c.id !== openConversationId))),
        ),
      ])
      fetching = false
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
