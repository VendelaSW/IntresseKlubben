import Avatar from '../../shared/Avatar'

// Så många syns som små avatarer, och resten som "+3 fler".
const SHOWN = 5

// Näst på tur i Matcha-fliken (MatchPanel): en tunn rad under det stora kortet med rubriken, de närmast på tur som små
// avatarer som överlappar lite (den första närmast) och "+3 fler", så att det syns att det finns fler förslag utan att
// det tar plats från kortet. Bara en förhandsvisning av ordningen, inte klickbar. `matches` är de som väntar (utan kortet
// som visas), bäst först, och `hasMore` att det finns fler att hämta än de som redan är hämtade.
function MatchUpNext({ matches, hasMore = false }) {
  if (matches.length === 0) return null
  const shown = matches.slice(0, SHOWN)
  const more = matches.length - shown.length
  const nameOf = (match) => match.name ?? match.username
  return (
    <section className="match-upnext" aria-label="Näst på tur">
      <h2 className="match-upnext-title">Näst på tur</h2>
      <ul className="match-strip-people">
        {shown.map((match) => (
          <li key={match.id} title={nameOf(match)}>
            <Avatar name={nameOf(match)} imageUrl={match.image_url} className="match-strip-avatar" />
            <span className="visually-hidden">{nameOf(match)}</span>
          </li>
        ))}
      </ul>
      {(more > 0 || hasMore) && <span className="match-strip-more">{more > 0 ? `+${more}` : '+'} fler</span>}
    </section>
  )
}

export default MatchUpNext
