import { useEffect, useState } from 'react'
import ConversationCard from '../components/ConversationCard'
import { getConversations, unseenConversationIds } from '../services/messages'

const TABS = [
  { id: 'new', label: 'Nya', empty: 'Inga nya brev just nu.' },
  { id: 'opened', label: 'Öppnade', empty: 'Inga öppnade brev än.' },
]

// Alla konversationer som kuvert, nyast överst, i två flikar: Nya (brev man
// inte har öppnat) och Öppnade. Finns det nya brev visas Nya först, annars
// Öppnade. Flikarna är samma som på Klubbar och Events (.filter-tabs).
function InboxPage() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [conversations, setConversations] = useState([])
  const [unseenIds, setUnseenIds] = useState(new Set())
  const [tab, setTab] = useState('new')

  useEffect(() => {
    getConversations()
      .then((data) => {
        const unseen = unseenConversationIds(data)
        setConversations(data)
        setUnseenIds(unseen)
        setTab(unseen.size > 0 ? 'new' : 'opened')
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

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
                  <ConversationCard conversation={conversation} isNew={tab === 'new'} />
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
