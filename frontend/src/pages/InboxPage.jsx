import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import ConversationCard from '../components/ConversationCard'
import { useTabParam } from '../hooks/useTabParam'
import { conversationsQuery } from '../services/messages'
import { shortNames } from '../utils/shortNames'

const TABS = [
  { id: 'new', label: 'Nya', empty: 'Inga nya brev just nu.' },
  { id: 'opened', label: 'Öppnade', empty: 'Inga öppnade brev än.' },
]

// Alla konversationer som kuvert, nyast överst, i två flikar: Nya (brev man
// inte har öppnat) och Öppnade. Finns det nya brev visas Nya först, annars
// Öppnade. Flikarna är samma som på Klubbar och Events (.filter-tabs).
function InboxPage() {
  // Konversationerna ur det delade minnet (se services/queryClient.js): har man
  // varit här nyss visas listan direkt, och hämtas om i bakgrunden.
  const { data: conversations = [], isSuccess, isError } = useQuery(conversationsQuery)
  const status = isSuccess ? 'ready' : isError ? 'error' : 'loading'
  // Olästa konversationer, räknat på servern (se markConversationRead).
  const unseenIds = useMemo(() => new Set(conversations.filter((c) => c.unread).map((c) => c.id)), [conversations])
  // Tills man har valt en flik själv: Nya om det finns nya brev, annars Öppnade.
  // Fliken står i adressen, så att Tillbaka från ett brev kommer hit igen (se useTabParam).
  const [chosenTab, setTab] = useTabParam(TABS)
  const tab = chosenTab ?? (unseenIds.size > 0 ? 'new' : 'opened')

  if (status === 'error') {
    return (
      <div className="content-stack">
        <p className="status-error">Kunde inte hämta breven. Försök igen senare.</p>
      </div>
    )
  }

  const lists = {
    new: conversations.filter((c) => unseenIds.has(c.id)),
    opened: conversations.filter((c) => !unseenIds.has(c.id)),
  }
  const current = TABS.find((t) => t.id === tab)
  // Förnamnen på kuverten, räknade på alla brev (båda flikarna), så att två med samma förnamn skiljs åt.
  const names = shortNames(conversations)

  // Sidan är ett <section className="app-section"> rakt av, som Personer,
  // Klubbar och Events, och ligger inte i content-stack (den är byggd för smala
  // sidor och skulle krympa kuverten).
  return (
    <section className="app-section">
      <h1 className="app-title">Brev</h1>

      {status === 'loading' ? (
        <p className="hint-text">Laddar brev...</p>
      ) : conversations.length === 0 ? (
        <p className="hint-text">Inga brev än.</p>
      ) : (
        <>
          <div className="filter-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tag${tab === t.id ? ' tag-selected' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label} ({lists[t.id].length})
              </button>
            ))}
          </div>

          {lists[tab].length > 0 ? (
            <ul className="envelopes">
              {lists[tab].map((conversation) => (
                <li key={conversation.id}>
                  <ConversationCard
                    conversation={conversation}
                    isNew={tab === 'new'}
                    shortName={names.get(conversation.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint-text">{current.empty}</p>
          )}
        </>
      )}
    </section>
  )
}

export default InboxPage
