// Vad appen är, i några meningar, för den som kommer till startsidan för första
// gången (se Home, ServiceInfo och demots startsida). Mer finns under "Läs mer
// om tjänsten" (ServiceDetails). `centered` centrerar texten (startsidan).
function ProblemStatement({ centered = false }) {
  return (
    <p className={`problem-statement${centered ? ' problem-statement-centered' : ''}`}>
      Intresseklubben hjälper dig hitta människor nära dig som delar dina intressen, oavsett
      om det är klättring, keramik eller brädspel. Skriv några rader om dig själv och välj
      dina intressen, så hittar du personer, klubbar och events på kartan.<br />
      Här finns allt för att gå från ett gemensamt intresse till en riktig träff.
    </p>
  )
}

export default ProblemStatement
