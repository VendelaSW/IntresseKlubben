// En pil nedåt, ritad med penna: ett lite ostadigt streck med en öppen pilspets av två streck, och spetsen dragen en
// gång till, lite bredvid, som när man går över med pennan. Används som scrollpil på startsidan och, vriden åt
// vänster, som tillbakapil på inloggningen och registreringen. `className` styr storleken och vridningen; färgen och
// strecken finns i .pen-arrow (startPage.css). Bara pynt, så den läses inte upp; knappen eller länken runt har en
// etikett.
function PenArrow({ className = '' }) {
  return (
    <svg className={`pen-arrow${className ? ` ${className}` : ''}`} viewBox="0 0 40 60" aria-hidden="true">
      <path d="M20.5 4 C18.6 17, 21.8 31, 19.6 51" />
      <path d="M7.5 37 C11.5 42.5, 15.5 47, 19.6 51.5 C23.4 46.5, 27.2 41.8, 32 36.5" />
      <path className="pen-arrow-pass" d="M9.5 40 C13 44, 16.2 47.6, 19.9 50.2 C23 46.6, 26.6 42.8, 30.5 39.4" />
    </svg>
  )
}

export default PenArrow
