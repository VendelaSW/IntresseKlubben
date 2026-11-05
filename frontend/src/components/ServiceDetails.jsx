// "Läs mer om tjänsten": hur appen fungerar och vem den är till för. Fälls ut
// på startsidan (se Home) och visas på /om (se ServiceInfo), så att texten bara
// finns på ett ställe.
function ServiceDetails({ id }) {
  return (
    <section id={id} className="service-details">
      <h2 className="service-details-heading">Så fungerar det</h2>
      <ol>
        <li>
          Skapa ett konto och svara på några frågor från Intressekompisen, appens maskot. Den tolkar
          dina intressen åt dig.
        </li>
        <li>
          Få förslag på medlemmar med gemensamma intressen och skicka en kompisförfrågan, eller skriv
          ett brev.
        </li>
        <li>Gå med i en klubb eller starta en egen, och bjud in till events där ni ses.</li>
      </ol>
      <h2 className="service-details-heading">För vem?</h2>
      <p>
        För alla som vill hitta nya kompisar genom sina intressen.
        Det spelar ingen roll vem du är, utan vad du gillar.
      </p>
    </section>
  )
}

export default ServiceDetails
