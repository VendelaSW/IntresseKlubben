import { useEffect } from 'react'
import { contactsQuery } from '../services/contacts'
import { eventsQuery } from '../services/events'
import { groupsOverviewQuery, myGroupsQuery } from '../services/groups'
import { getAllInterests, getMyInterests } from '../services/interests'
import { conversationsQuery } from '../services/messages'
import { peopleQuery } from '../services/people'
import { getMunicipalities } from '../services/profile'
import { queryClient } from '../services/queryClient'

// Väntar lite, så att sidan man landar på (t.ex. kartan) hämtar sitt först.
const DELAY_MS = 1000

// Förladdar det Brev, Personer (utan filter), Klubbar och Events behöver i det
// delade minnet (se services/queryClient.js), så att de visas direkt första
// gången man klickar dit i stället för att visa "Laddar...". Det som redan
// finns och är färskt hämtas inte igen, och ett fel här märks inte: sidan
// hämtar då själv som vanligt.
//
// `userId` är den inloggade med klar profil, annars null (anropen är låsta
// tills profilen är klar, require_profile i backend).
export function usePrefetchPages(userId) {
  useEffect(() => {
    if (userId == null) return
    const timer = setTimeout(() => {
      for (const query of [conversationsQuery, peopleQuery(), contactsQuery, groupsOverviewQuery, eventsQuery, myGroupsQuery]) {
        queryClient.prefetchQuery(query)
      }
      Promise.all([getAllInterests(), getMyInterests(), getMunicipalities()]).catch(() => {})
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [userId])
}
