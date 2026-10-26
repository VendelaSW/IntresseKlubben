import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { formatSentAt } from '../utils/formatSentAt'

// En konversation i inkorgen, som ett kuvert med personens bild, namn och när
// det senaste brevet kom. Över namnet står "Från" eller "Till" (vem som skrev
// det senaste brevet), så att ett brev man själv har skickat inte ser ut att
// vara till en själv. Hela kuvertet länkar till tråden (ConversationPage).
// Klickbart som andra kort (.card-interactive): lyfts och får gul kant vid hover.
// Ett öppnat kuvert öppnar fliken och visar en bit av brevpappret vid hover; ett
// nytt (`isNew`) förblir stängt och har ett gult sigill. Se Brev i stilguiden.
// `shortName` är namnet på kuvertet (förnamnet, se utils/shortNames.js). Hela
// namnet läses upp och syns när man håller musen över.
function ConversationCard({ conversation, isNew = false, shortName }) {
  const name = conversation.name ?? conversation.username
  const direction = conversation.last_message_from_me ? 'Till' : 'Från'
  return (
    <Link
      to={`/meddelanden/${conversation.id}`}
      className={`envelope card-interactive${isNew ? ' envelope-new' : ''}`}
      aria-label={isNew ? `Brev ${direction.toLowerCase()} ${name}, nya brev` : `Brev ${direction.toLowerCase()} ${name}`}
    >
      <span className="envelope-inside" aria-hidden="true" />
      <span className="envelope-letter lined-paper" aria-hidden="true" />
      <span className="envelope-front" aria-hidden="true">
        {/* Bild och namn, och datumet under, nertill som en adress på ett kuvert. */}
        <span className="envelope-address">
          <span className="envelope-direction">{direction}</span>
          <span className="envelope-addressee">
            <Avatar name={name} imageUrl={conversation.image_url} className="person-list-avatar envelope-avatar" />
            <span className="envelope-name" title={name}>
              {shortName ?? name}
            </span>
          </span>
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
