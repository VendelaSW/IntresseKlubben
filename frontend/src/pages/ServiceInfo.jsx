import DirectionTeaser from '../components/DirectionTeaser'

function ServiceInfo() {
  return (
    <div className="page">
      <h1>Om IntresseKlubben</h1>
      <p className="problem-statement">
        Intresseklubben hjälper dig hitta andra som delar exakt ditt intresse,
        oavsett om det är dykning, keramik eller brädspel. Du skapar en profil,
        listar dina intressen och ser andra användare och intressegrupper på en
        karta nära dig — så blir det enkelt att gå från gemensamt intresse till
        en faktisk träff.
      </p>
      <DirectionTeaser />
    </div>
  )
}

export default ServiceInfo
