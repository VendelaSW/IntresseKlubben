import { Link } from 'react-router-dom'
import { formatSentAt } from '../utils/formatSentAt'

// En konversation i inkorgen, som ett kuvert med personens namn och när det
// senaste brevet kom. Hela kuvertet länkar till tråden (ConversationPage).
// Klickbart som andra kort (.card-interactive): lyfts och får gul kant vid hover.
// Ett öppnat kuvert öppnar fliken och visar en bit av brevpappret vid hover; ett
// nytt (`isNew`) förblir stängt och har ett gult sigill. Se Brev i stilguiden.
function ConversationCard({ conversation, isNew = false }) {
  const name = conversation.name ?? conversation.username
  return (
    <Link
      to={`/meddelanden/${conversation.id}`}
      className={`envelope card-interactive${isNew ? ' envelope-new' : ''}`}
      aria-label={isNew ? `Brev med ${name}, nya brev` : `Brev med ${name}`}
    >
      <span className="envelope-inside" aria-hidden="true" />
      <span className="envelope-letter lined-paper" aria-hidden="true" />
      <span className="envelope-front" aria-hidden="true">
        {/* Vikkanterna från hörnen nertill upp mot mitten. */}
        <svg viewBox="0 0 100 70" preserveAspectRatio="none">
          <path d="M0 70 L45 30 M100 70 L55 30" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Namnet och datumet staplade nertill, som en adress på ett kuvert. */}
        <span className="envelope-address">
          <span className="envelope-name">{name}</span>
          <time className="envelope-when" dateTime={conversation.last_message_at}>
            {formatSentAt(conversation.last_message_at)}
          </time>
        </span>
      </span>
      <span className="envelope-flap" aria-hidden="true" />
      {isNew && (
        <span className="envelope-seal" aria-hidden="true">
          Nytt
        </span>
      )}
    </Link>
  )
}

export default ConversationCard
