import { useState } from 'react'

// Ett fel när något inte gick att hämta, med "Försök igen" under texten (SCRUM-286), så att
// man inte behöver lämna sidan och öppna den igen. `onRetry` hämtar om, och `retrying` visar
// att det pågår (knappen är avstängd tills dess). `className` är textens klass, som innan
// (t.ex. 'status-error', 'form-error' eller 'hint-text' för ett mindre fel inne i en vy).
function LoadError({ text, onRetry, retrying = false, className = 'status-error' }) {
  return (
    <div className="load-error">
      <p className={className}>{text}</p>
      <button type="button" className="secondary-button" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Hämtar...' : 'Försök igen'}
      </button>
    </div>
  )
}

// För en hämtning i en useEffect: lägg `attempt` bland effektens beroenden, så hämtar
// `retry()` om.
export function useRetry() {
  const [attempt, setAttempt] = useState(0)
  return [attempt, () => setAttempt((n) => n + 1)]
}

export default LoadError
