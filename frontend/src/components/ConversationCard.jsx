import { Link } from 'react-router-dom'

function initials(name) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Ett kort för en konversation i inkorgen. Hela kortet länkar vidare till
// själva tråden, samma route som ConversationPage visar.
function ConversationCard({ conversation }) {
  return (
    <Link
      to={`/meddelanden/${conversation.id}`}
      className="card card-interactive person-card"
    >
      {conversation.image_url ? (
        <img src={conversation.image_url} alt="" className="card-avatar" />
      ) : (
        <div className="card-avatar card-avatar-initials" aria-hidden="true">
          {initials(conversation.name)}
        </div>
      )}
      <p className="card-title">{conversation.name ?? conversation.username}</p>
      <p className="card-text">{conversation.last_message}</p>
    </Link>
  )
}

export default ConversationCard
