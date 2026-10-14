import { Link } from 'react-router-dom'
import Avatar from './Avatar'

// Avsändaren vid ett meddelande i brevtråden och klubbchatten: bild och namn.
// Är det någon annan blir de en länk till personens profil. Ens egna ("Du",
// med den gula överstrykningspennan) och en tidigare medlem utan konto
// (`userId` saknas) är inte länkar. `name` är namnet bilden visar initialen av.
function ChatSender({ userId, name, imageUrl, mine }) {
  const content = (
    <>
      <Avatar name={name} imageUrl={imageUrl} className="person-list-avatar notepad-message-avatar" />
      <strong className={mine ? 'highlight' : undefined}>{mine ? 'Du' : name}</strong>
    </>
  )
  if (mine || !userId) return content
  return (
    <Link to={`/anvandare/${userId}`} className="notepad-person-link">
      {content}
    </Link>
  )
}

export default ChatSender
