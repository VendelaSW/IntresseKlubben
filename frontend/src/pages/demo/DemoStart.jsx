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
    </div>
  )
}

export default DemoStart
