import { useNavigate } from 'react-router-dom'

// Demons första sida: bara en knapp som leder till intervjun. Knappen är en riktig
// <button> (inte en länk) så att den ser ut som övriga knappar, och klicket gör att
// videon på nästa sida får spela med ljud direkt.
function DemoStart() {
  const navigate = useNavigate()
  return (
    <div className="page" style={{ minHeight: '60vh', justifyContent: 'center' }}>
      <button type="button" className="primary-button" onClick={() => navigate('/demo/intervju')}>
        Skapa din intresseprofil
      </button>
      <p className="hint-text">
        För att testa en OpenAI-modell som plockar ut intressen från fritext, fråga Nick om en api-nyckel!
      </p>
    </div>
  )
}

export default DemoStart
