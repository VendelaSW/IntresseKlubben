import { useEffect, useState } from 'react'
import ConversationCard from '../components/ConversationCard'
import { getConversations } from '../services/messages'

// Listar alla konversationer, nyast överst. Sidstrukturen följer samma
// mönster som PeoplePage.jsx (app-section/app-title/card-grid).
function InboxPage() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [conversations, setConversations] = useState([])

  useEffect(() => {
    getConversations()
      .then((data) => {
        setConversations(data)
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

  return (
    <div className="content-stack">
      <section className="app-section">
        <h1 className="app-title">Brev</h1>

        {status === 'loading' ? (
          <p className="hint-text">Laddar brev...</p>
        ) : conversations.length > 0 ? (
          <div className="card-grid">
            {conversations.map((conversation) => (
              <ConversationCard key={conversation.username} conversation={conversation} />
            ))}
          </div>
        ) : (
          <p className="hint-text">Inga brev än.</p>
        )}
      </section>
    </div>
  )
}

export default InboxPage
