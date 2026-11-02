import { useQuery } from '@tanstack/react-query'
import ConversationCard from '../components/ConversationCard'
import EmptyState from '../components/EmptyState'
import { contactsQuery } from '../services/contacts'
import { conversationsQuery } from '../services/messages'
import { shortNames } from '../utils/shortNames'
import LetterFriends from '../components/LetterFriends'
import LoadError from '../components/LoadError'

// Alla konversationer som kuvert på en sida: de man inte har öppnat först och
// sedan de öppnade, nyast överst i båda (SCRUM-319).
// Överst en rad med kompisar man inte har några brev med än (SCRUM-320).
function InboxPage() {
  // Konversationerna ur det delade minnet (se services/queryClient.js): har man
  // varit här nyss visas listan direkt, och hämtas om i bakgrunden.
  const { data: conversations = [], isSuccess, isError, refetch, isFetching } = useQuery(conversationsQuery)
  const status = isSuccess ? 'ready' : isError ? 'error' : 'loading'
  const { data: contactsData } = useQuery(contactsQuery)

  if (status === 'error') {
    return (
      <div className="content-stack">
        <LoadError text="Kunde inte hämta breven." onRetry={() => refetch()} retrying={isFetching} />
      </div>
    )
  }

  // Listan kommer nyast först från API:t. Oläst räknas på servern (se markConversationRead).
  const ordered = [...conversations.filter((c) => c.unread), ...conversations.filter((c) => !c.unread)]
  // Förnamnen på kuverten, så att två med samma förnamn skiljs åt.
  const names = shortNames(conversations)
  const withLetters = new Set(conversations.map((c) => c.id))
  const friends = status === 'ready' ? (contactsData?.contacts ?? []).map((c) => c.user).filter((f) => !withLetters.has(f.id)) : []

  // Sidan är ett <section className="app-section"> rakt av, som Personer,
  // Klubbar och Events, och ligger inte i content-stack (den är byggd för smala
  // sidor och skulle krympa kuverten).
  return (
    <section className="app-section">
      <h1 className="app-title">Brev</h1>

      {friends.length > 0 && <LetterFriends friends={friends} />}

      {status === 'loading' ? (
        <p className="hint-text">Laddar brev...</p>
      ) : conversations.length === 0 ? (
        <EmptyState text="Här hamnar brev mellan dig och dina kompisar. Skriv till någon från deras profil under Medlemmar." />
      ) : (
        <ul className="envelopes">
          {ordered.map((conversation) => (
            <li key={conversation.id}>
              <ConversationCard
                conversation={conversation}
                isNew={conversation.unread}
                shortName={names.get(conversation.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default InboxPage
