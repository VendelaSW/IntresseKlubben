// En liten pil nedåt som ser skissad ut, som i ett ritblock: en lite bucklig
// kontur, ovansidan dragen en gång till förbi hörnen, och några snedstreck som
// skrafferar ungefär halva pilen. Visar att något går att fälla ut:
// intressetaggar med underintressen och kategorierna under Utforska. Färgen
// följer texten, och `className` styr vridningen (vänds uppåt när det är öppet).
// Bara pynt, så den läses inte upp.
function DrawnArrow({ className }) {
  return (
    <svg className={`drawn-arrow ${className}`} viewBox="0 0 12 10" aria-hidden="true">
      {/* Konturen, lite sned och bucklig. */}
      <path d="M1.6 2.2 C3.4 1.5, 6.9 2.4, 10.4 1.4 C9.9 2.9, 8.1 5.1, 6.6 8.6 C5.6 7.2, 4.4 5.9, 3.6 4.9 C2.9 4.1, 2.1 3.2, 1.6 2.2 Z" />
      {/* Ovansidan en gång till, lite förbi hörnen, som med en penna. */}
      <path d="M0.6 1.9 C3.8 1, 7.6 2, 11.4 0.9" />
      {/* Skrafferingen: snedstreck som inte når ända ut till kanterna. */}
      <path className="drawn-arrow-hatch" d="M3.3 3.3 L4.4 2.3 M4.1 4.6 L6.2 2.4 M5.1 5.9 L8 2.3 M6.1 7.2 L9.1 2.7" />
    </svg>
  )
}

export default DrawnArrow
