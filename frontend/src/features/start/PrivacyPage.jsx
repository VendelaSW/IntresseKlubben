import { useLayoutEffect } from 'react'
import { Link } from 'react-router-dom'
import HomeLink from './HomeLink'
import logo from '../../assets/intresseklubben.png'

// Integritetspolicyn: vilka uppgifter Intresseklubben sparar, varför, vem som får se dem, vilka tjänster som får ta del av
// dem, hur länge och hur man raderar sitt konto. Går att nå utan att vara inloggad (/integritet, länkad från startsidans
// fot och längst ner på Att göra-sidan), och skriven på enkel svenska. Texten bygger på vad koden faktiskt gör, så den ska ändras när något av det
// ändras (en ny tjänst som tar emot uppgifter, ett nytt fält som sparas).
//
// Kontaktuppgifterna: de som får frågor om uppgifterna.
function Contact() {
  return (
    <>
      <a href="mailto:waltalex2@hotmail.com">waltalex2@hotmail.com</a> eller{' '}
      <a href="mailto:nicklas.thegerstrom@gmail.com">nicklas.thegerstrom@gmail.com</a>
    </>
  )
}

function PrivacyPage() {
  // Överst, också när man kommer från en sida man har scrollat ner på (t.ex. länken längst ner på startsidan): appen
  // byter sida utan att ladda om, och då ligger webbläsaren kvar på samma ställe.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="page service-page">
      <HomeLink />
      <Link to="/" className="service-logo-link">
        <img src={logo} alt="Intresseklubben" className="logo-small" />
      </Link>
      <h1 className="service-heading">Så använder Intresseklubben dina uppgifter</h1>

      <article className="service-details policy">
        <p>
          Här står vad vi sparar om dig, vem som får se det och hur du tar bort det. Har du frågor, hör av dig till{' '}
          <Contact />. Ansvariga för uppgifterna är vi som projektgrupp.
        </p>

        <h2 className="service-details-heading">Vad vi sparar och varför</h2>
        <p>Vi sparar det du skriver när du skapar och använder ditt konto, för att appen ska fungera:</p>
        <ul>
          <li>
            <strong>Konto:</strong> användarnamn, e-postadress och lösenord. Lösenordet sparas bara som en hash (bcrypt),
            en omvandling som inte går att vända tillbaka. Därför kan ingen se ditt lösenord, inte ens vi, och om du
            glömmer det får du välja ett nytt. Vi sparar också när kontot skapades, om du har bekräftat din e-post och när
            du senast bytte lösenord, och de engångskoder vi mejlar dig för att bekräfta adressen eller byta lösenord.
          </li>
          <li>
            <strong>Profil:</strong> namn, födelsedatum, kön, kommun, stadsdel (valfritt), en text om dig själv och en
            profilbild. Vi sparar också dina val: om du döljer din ålder och om andra får hitta dig genom att söka på kön.
          </li>
          <li>
            <strong>Intressen:</strong> dina intressen, med det du gör inom dem och en egen etikett om du har satt någon.
          </li>
          <li>
            <strong>Vektor för din text:</strong> texten du skriver om dig själv görs om till en vektor, en lång rad tal som
            beskriver vad texten handlar om, så att appen kan hitta personer som liknar dig. Vektorn sparas i databasen hos
            Neon. Den går inte att läsa som text, och den byts ut eller tas bort när du ändrar texten eller raderar kontot.
          </li>
          <li>
            <strong>Kontakter och brev:</strong> dina kontakter och kontaktförfrågningar, de du har blockerat, de brev du
            skickar och får, och hur långt du har läst i varje brevväxling. Vi sparar också vilka förslag på personer du har
            tagit bort, så att de inte dyker upp igen.
          </li>
          <li>
            <strong>Klubbar och events:</strong> de klubbar du är med i eller har ansökt till, det du skriver i klubbarnas
            chattar och på anslagstavlorna, events du skapar eller är medarrangör för, och dina svar, inbjudningar och
            ansökningar till events.
          </li>
          <li>
            <strong>Notiser:</strong> de notiser du får i appen, till exempel när någon svarar på ett event.
          </li>
          <li>
            <strong>Anmälningar och moderering:</strong> se nedan.
          </li>
        </ul>
        <p>
          Vi använder inga spårningskakor, ingen reklam och ingen webbanalys. <strong>Skriv inte känsliga uppgifter</strong>{' '}
          (som personnummer eller hälsa) i de fria texterna. De visas för andra, och en del läses av en AI-tjänst (se
          nedan).
        </p>

        <h2 className="service-details-heading">Anmälningar och moderering</h2>
        <p>
          Alla kan anmäla en profil, ett brev, ett meddelande i en klubbchatt eller en lapp på en anslagstavla, om det
          bryter mot reglerna. Vid en anmälan sparar vi vem som anmälde, vem eller vad som anmäldes, orsaken (till exempel
          trakasserier, olämpligt innehåll, spam eller falsk profil), en kopia av det anmälda meddelandet och en
          kommentar om anmälaren skrev någon.
        </p>
        <p>
          Anmälningarna läser vi som team (moderatorerna). Vi bestämmer själva hur allvarligt vi tar det som har hänt och
          vad som ska hända. Det kan vara att inget görs, att personen får en <strong>varning</strong> (med ett meddelande
          om vad som var fel), eller att kontot <strong>stängs av</strong>, en viss tid eller tills vidare. Då kan personen
          inte använda appen. Varningar och avstängningar sparas med orsak och datum. De som är moderatorer ser
          anmälningarna, och ingen annan.
        </p>

        <h2 className="service-details-heading">Din position</h2>
        <p>
          Appen använder din position (GPS) bara i webbläsaren, och först när du trycker på knappen och har gett lov.
          Positionen sparas inte, skickas inte till vår backend och delas inte med andra. Den visar bara dig själv var du
          är på kartan. Kartan hämtar sina kartbilder för området som visas, så den tjänsten kan se vilket område du
          tittar på, som när du bläddrar på kartan.
        </p>

        <h2 className="service-details-heading">Vad andra ser</h2>
        <p>
          Andra inloggade ser ditt användarnamn, namn, din ålder (om du inte döljer den), kommun, stadsdel, text om dig
          själv, profilbild och intressen. De ser aldrig ditt födelsedatum, din e-postadress eller ditt lösenord. Breven
          och chattarna ser bara de som är med i dem.
        </p>

        <h2 className="service-details-heading">Vilka tjänster som får ta del av uppgifter</h2>
        <ul>
          <li>
            <strong>OpenAI (AI-tjänst):</strong> får texten du skriver om dig själv, det du skriver om dina intressen när
            du skapar din profil och orden du skriver när du lägger till ett eget intresse. Den används för att
            kontrollera texten, hitta dina intressen och föreslå personer som liknar dig. Vi skickar inte med ditt namn
            eller din e-post. OpenAI är ett amerikanskt företag, så uppgifterna behandlas <strong>utanför EU</strong>.
          </li>
          <li>
            <strong>Resend (e-post):</strong> får din e-postadress när vi mejlar dig, för att bekräfta adressen eller byta
            lösenord.
          </li>
          <li>
            <strong>Kartor (OpenFreeMap och OpenStreetMap):</strong> din webbläsare hämtar kartan direkt från dem, så de ser
            din IP-adress. Adresser vi söker upp åt dig skickas utan att säga vem du är.
          </li>
          <li>
            <strong>Neon (databas och bilder) och Vercel (där appen körs):</strong> här ligger allt vi sparar. Databasen och
            bilderna ligger i Frankfurt (inom EU).
          </li>
        </ul>
        <p>Vi säljer aldrig dina uppgifter och delar dem inte med någon annan.</p>

        <h2 className="service-details-heading">Hur länge vi sparar det</h2>
        <p>Så länge du har kontot. När du raderar det försvinner uppgifterna.</p>

        <h2 className="service-details-heading">Radera ditt konto</h2>
        <p>
          Välj <strong>Radera konto</strong> i din profil och skriv ditt lösenord. Då raderas på en gång din profil,
          din vektor, dina intressen och din bild, alla dina brev (också hos mottagaren), dina kontakter, blockeringar,
          chattmeddelanden, events och notiser, ditt medlemskap i klubbar och dina varningar och avstängningar. Kvar
          finns anmälningar som moderatorerna kan behöva granska, men utan koppling till ditt konto.
        </p>

        <h2 className="service-details-heading">Dina rättigheter</h2>
        <p>
          Du har rätt att veta vad vi sparar om dig, få fel rättade och få uppgifter raderade. Ändra din profil under{' '}
          <strong>Redigera profil</strong>, eller hör av dig till <Contact /> om du vill ha en kopia eller
          har frågor.
        </p>
        <p>
          Du måste vara minst 13 år för att skapa ett konto.
        </p>
        <p className="hint-text">
          Senast ändrad: 3 november 2026
        </p>
      </article>
    </div>
  )
}

export default PrivacyPage