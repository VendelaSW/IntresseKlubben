import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { formatSentAt } from '../utils/formatSentAt'

// Snörets banor: bandet runt kuvertet, rosetten och de två ändarna (den vänstra kortare).
const TWINE = [
  'M1 30 C20 28 35 31 50 30 C65 29 80 32 99 30',
  'M50 30 C38 17 27 21 30 29 C32 35 42 34 50 30',
  'M50 30 C62 17 73 21 70 29 C68 35 58 34 50 30',
  'M50 30 C47 34 43 37 39 40',
  'M50 30 C54 35 60 39 67 43',
]

// En konversation i inkorgen, som ett kuvert med personens bild, namn och när
// det senaste brevet kom. Över namnet står "Från" eller "Till" (vem som skrev
// det senaste brevet), så att ett brev man själv har skickat inte ser ut att
// vara till en själv. Hela kuvertet länkar till tråden (ConversationPage).
// Klickbart som andra kort (.card-interactive): lyfts och får gul kant vid hover.
// Ett öppnat kuvert står öppet, med fliken uppvikt och en bit av brevpappret synlig;
// ett nytt (`isNew`) är stängt och knutet med ett snöre. Se Brev i stilguiden.
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
        <svg className="envelope-bow" viewBox="0 0 100 70" aria-hidden="true">
          {TWINE.map((d) => (
            <path key={d} className="envelope-twine" d={d} />
          ))}
          {TWINE.map((d) => (
            <path key={d} className="envelope-twine-twist" d={d} />
          ))}
          <circle className="envelope-knot" cx="50" cy="30" r="2.6" />
        </svg>
      )}
    </Link>
  )
}

export default ConversationCard
