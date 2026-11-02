import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import eventIcon from '../assets/event.png'
import karta from '../assets/startsida/karta.jpg'
import dans from '../assets/startsida/dans.jpg'
import dansClip from '../assets/startsida/dans.mp4'
import klattra from '../assets/startsida/klattra.jpg'
import klattraClip from '../assets/startsida/klattra.mp4'
import mat from '../assets/startsida/mat.jpg'
import matClip from '../assets/startsida/mat.mp4'
import spel from '../assets/startsida/spel.jpg'
import spelClip from '../assets/startsida/spel.mp4'
import HandwrittenHeadline, { alreadyWritten } from '../components/HandwrittenHeadline'
import InterestTags from '../components/InterestTags'
import Intressekompis from '../components/Intressekompis'
import PenArrow from '../components/PenArrow'
import { eventExtrasText, eventWhenWhereText, VisibilityStamp } from '../components/events/EventList'
import { DEV_MODE } from '../devtools/devMode'
import { useAuth } from '../hooks/useAuth'
import { areaColors } from '../utils/interestColors'
import MapPad from './MapPad'
import '../styles/map.css'
import '../styles/startPage.css'

// TILLFÄLLIGT: den nya startsidan, på /ny-start tills den ersätter Home. Ingen länk pekar hit än.
//
// En lång sida: rubriken skrivs för hand (se HandwrittenHeadline) med polaroider runt, "Så funkar det" i tre steg,
// kartan med påhittade events, intressena och en sista uppmaning med Intressekompisen. Knapparna leder till
// /logga-in och /registrera (AuthPage). Rubrikerna skrivs bara första gången per session.

const WRITTEN_KEY = 'intresseklubben.startsida-skriven'

// Testläget: /ny-start?skriv låter sidan röra sig också med "minska rörelse" påslaget i datorn. Rubriken skrivs och
// polaroiderna faller ändå bara första gången per session; för att se det igen, öppna sidan i en ny flik.
const alwaysWrite = () => DEV_MODE && new URLSearchParams(window.location.search).has('skriv')

// Polaroiderna i toppen: Nicks korta filmer (kopierade från src/devtools/video), som spelas utan ljud i en slinga.
// Med "minska rörelse" (utom med ?skriv i testläget) visas stillbilden i stället; den syns också medan filmen laddas.
const POLAROIDS = [
  { name: 'dans', image: dans, clip: dansClip, caption: 'Dansa ihop', tilt: -7 },
  { name: 'mat', image: mat, clip: matClip, caption: 'Laga mat tillsammans', tilt: 6 },
  { name: 'klattra', image: klattra, clip: klattraClip, caption: 'Klättra med nya vänner', tilt: 5 },
  { name: 'spel', image: spel, clip: spelClip, caption: 'Spelkväll!', tilt: -4 },
]

const playClips = () => alwaysWrite() || !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const STEPS = [
  { title: 'Berätta om dig', text: 'Skriv några rader om dig själv, så att andra vet vem du är.' },
  { title: 'Välj dina intressen', text: 'Allt från klättring till keramik. Ju fler du väljer, desto fler hittar du.' },
  {
    title: 'Ses på riktigt',
    text: 'Hitta medlemmar, klubbar och events nära dig på kartan, och skriv ett brev eller häng med.',
  },
]

// Intressena som glider förbi i tre rader: riktiga intressen ur intressebiblioteket (backend/app/data/interests.json),
// från så många huvudområden som möjligt, med områdets slug för färgen. Ändras biblioteket behöver namnen ses över.
const INTEREST_ROWS = [
  [
    ['Klättring', 'friluftsliv'],
    ['Brädspel', 'spel-och-pussel'],
    ['K-pop', 'musik'],
    ['Surdegsbakning', 'mat-och-dryck'],
    ['Fågelskådning', 'djur-och-natur'],
    ['Salsa', 'dans'],
    ['Programmering', 'teknik'],
    ['Keramik', 'skapande'],
    ['Formel 1', 'fordon-och-motorsport'],
    ['Astrologi', 'mystik-och-andlighet'],
    ['Sneakers', 'mode-och-stil'],
    ['Stand-up', 'scen-och-teater'],
    ['Gatukonst', 'museer-och-konst'],
    ['Vikingatiden', 'kultur-och-samhalle-historia'],
    ['Språkcafé', 'sprak'],
    ['Tågluffning', 'resor'],
  ],
  [
    ['Studio Ghibli', 'film-och-tv'],
    ['Bokcirkel', 'bocker'],
    ['Pokémon-spelen', 'tv-spel'],
    ['Dungeons & Dragons', 'spel-och-pussel'],
    ['Padel', 'sport-och-traning'],
    ['Bouldering', 'friluftsliv'],
    ['Fika', 'mat-och-dryck'],
    ['Katter', 'djur-och-natur'],
    ['Lindy hop', 'dans'],
    ['Drönare', 'teknik'],
    ['Stickning', 'skapande'],
    ['Segling', 'fordon-och-motorsport'],
    ['Rymdfart', 'vetenskap'],
    ['Tarot', 'mystik-och-andlighet'],
    ['Musikal', 'scen-och-teater'],
    ['Japanska', 'sprak'],
  ],
  [
    ['Jazz', 'musik'],
    ['True crime', 'film-och-tv'],
    ['Harry Potter', 'bocker'],
    ['Elden Ring', 'tv-spel'],
    ['Pubquiz', 'spel-och-pussel'],
    ['Löpning', 'sport-och-traning'],
    ['Fjällvandring', 'friluftsliv'],
    ['Vinprovning', 'mat-och-dryck'],
    ['Trädgård', 'djur-och-natur'],
    ['Bachata', 'dans'],
    ['Lego', 'skapande'],
    ['Arkitektur', 'museer-och-konst'],
    ['Släktforskning', 'kultur-och-samhalle-historia'],
    ['Backpacking', 'resor'],
    ['Volontärarbete', 'samhalle-och-engagemang'],
    ['Podcasts', 'podcasts-och-radio'],
  ],
]

// En tid `days` dagar fram, så att de påhittade eventen alltid ligger framåt.
function daysFromNow(days, hour) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

// Påhittade events på kartan, med samma fält som från backend. `x` och `y` är platsen på kartbilden, i procent, och
// `mx` och `my` platsen på en telefon, där kartan är smalare och lapparna annars hamnar på varandra.
function demoEvents() {
  const base = { visibility: 'open', scope: 'municipality', scope_name: null, is_full: false }
  return [
    {
      ...base,
      id: 1,
      title: 'Brädspelskväll',
      description: 'Vi spelar allt från strategispel till snabba kortspel. Ta med ett eget spel om du vill.',
      starts_at: daysFromNow(3, 18),
      ends_at: daysFromNow(3, 21),
      place_name: 'Södermalm',
      interest_id: 1,
      interest_name: 'Brädspel',
      interest_area_slug: 'spel-och-pussel',
      yes_count: 6,
      max_attendees: 10,
      creator_name: 'Anna',
      group_name: 'Spelklubben Söder',
      x: 48,
      y: 57,
      mx: 36,
      my: 56,
    },
    {
      ...base,
      id: 2,
      title: 'Klättring för nybörjare',
      description: 'Vi lånar skor på plats och börjar på de lätta lederna. Ingen erfarenhet behövs.',
      starts_at: daysFromNow(5, 17),
      ends_at: daysFromNow(5, 19),
      place_name: 'Solna',
      interest_id: 2,
      interest_name: 'Klättring',
      interest_area_slug: 'sport-och-traning',
      yes_count: 4,
      max_attendees: 8,
      creator_name: 'Omar',
      group_name: null,
      x: 39,
      y: 36,
      mx: 27,
      my: 31,
    },
    {
      ...base,
      id: 3,
      title: 'Keramikkväll',
      description: 'Dreja eller bygg för hand. Lera finns, ta med förkläde.',
      starts_at: daysFromNow(6, 18),
      ends_at: daysFromNow(6, 20),
      place_name: 'Nacka',
      interest_id: 3,
      interest_name: 'Keramik',
      interest_area_slug: 'skapande',
      yes_count: 3,
      max_attendees: null,
      creator_name: 'Lina',
      group_name: 'Lerklubben',
      x: 67,
      y: 61,
      mx: 66,
      my: 69,
    },
    {
      ...base,
      id: 4,
      title: 'Fågelskådning',
      description: 'En lugn morgonpromenad med kikare. Vi har några extra att låna ut.',
      starts_at: daysFromNow(9, 8),
      ends_at: daysFromNow(9, 11),
      place_name: 'Lidingö',
      interest_id: 4,
      interest_name: 'Fågelskådning',
      interest_area_slug: 'djur-och-natur',
      yes_count: 2,
      max_attendees: null,
      creator_name: 'Erik',
      group_name: null,
      x: 59,
      y: 35,
      mx: 70,
      my: 43,
    },
    {
      ...base,
      id: 5,
      title: 'Salsa för alla',
      description: 'Grundsteg för nybörjare, sedan fri dans. Du behöver ingen partner.',
      starts_at: daysFromNow(11, 19),
      ends_at: daysFromNow(11, 21),
      place_name: 'Huddinge',
      interest_id: 5,
      interest_name: 'Salsa',
      interest_area_slug: 'dans',
      yes_count: 9,
      max_attendees: 20,
      creator_name: 'Sara',
      group_name: 'Salsaklubben',
      x: 29,
      y: 82,
      mx: 30,
      my: 83,
    },
  ]
}

// Pilen i toppen: glid mjukt ned så att "Så funkar det" hamnar en bit ned i fönstret (11 % av höjden), med pilen och
// slutet av toppen synliga ovanför och början på kartan under, så att man ser att sidan fortsätter åt båda hållen. Är
// delen för hög för att det ska få plats (t.ex. på en telefon) hamnar den överst. Direkt, utan att glida, med "minska
// rörelse".
function scrollToSteps(event) {
  event.preventDefault()
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const rect = document.getElementById('sa-funkar-det').getBoundingClientRect()
  const above = Math.max(0, Math.min(window.innerHeight * 0.11, window.innerHeight - rect.height))
  window.scrollTo({ top: window.scrollY + rect.top - above, behavior: smooth ? 'smooth' : 'auto' })
}

const markerDate = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })

function StartPage() {
  const { user, loading } = useAuth()
  const [headlineDone, setHeadlineDone] = useState(false)
  const [openEvent, setOpenEvent] = useState(null)
  // Sidan får röra sig (intressena glider, pilen gungar), utom med "minska rörelse" (.is-animated i startPage.css).
  // Polaroiderna och klottret kommer fram med en animation bara första gången per session, som rubriken (.is-intro);
  // går man tillbaka till sidan ligger de redan där.
  const [animated] = useState(() => alwaysWrite() || !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [intro] = useState(() => animated && !alreadyWritten(WRITTEN_KEY))
  const events = useMemo(demoEvents, [])

  // Redan inloggad: inget att göra här, skicka vidare till kartan.
  if (loading) return null
  if (user) return <Navigate to="/hem" replace />

  return (
    <div className={`start-page${animated ? ' is-animated' : ''}${intro ? ' is-intro' : ''}`}>
      <section className="start-hero start-lined">
        <img src={logo} alt="Intresseklubben" className="start-logo" />
        <HandwrittenHeadline
          lines={['Vi antecknar,', 'ni träffas.']}
          storageKey={WRITTEN_KEY}
          always={alwaysWrite()}
          className="start-headline"
          onDone={() => setHeadlineDone(true)}
        />

        <HeroDoodles shown={headlineDone} />

        <ul className={`start-polaroids${headlineDone ? ' is-shown' : ''}`} aria-hidden="true">
          {POLAROIDS.map(({ name, image, clip, caption, tilt }, i) => (
            <li
              key={name}
              className={`start-polaroid start-polaroid-${i + 1}`}
              style={{ '--tilt': `${tilt}deg`, '--order': i }}
            >
              {playClips() ? (
                <video src={clip} poster={image} autoPlay muted loop playsInline />
              ) : (
                <img src={image} alt="" />
              )}
              <span className="start-polaroid-caption">{caption}</span>
            </li>
          ))}
        </ul>

        {/* Kortare än ProblemStatement (som Home och Om tjänsten har kvar); resten står under "Så funkar det". */}
        <p className="problem-statement problem-statement-centered start-intro">
          Hitta människor nära dig som gillar samma saker som du, och ses på riktigt.
        </p>
        <div className="account-choice-links start-actions">
          {/* En liten lapp under och till vänster om knapparna, med en pil upp mot dem. Bara på en bred skärm. Bara pynt. */}
          <div className={`start-actions-note${headlineDone ? ' is-shown' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 72 44">
              <path d="M8 41 C10 20, 32 7, 64 11" />
              <path d="M53 4 L65 11 L54 18" />
            </svg>
            <span>ses på lördag?</span>
          </div>
          <Link to="/registrera" className="primary-button button-large start-marker">
            Registrera dig
          </Link>
          <Link to="/logga-in" className="secondary-button button-large start-marker">
            Logga in
          </Link>
        </div>
        {/* En handritad pil längst ned i fönstret, till "Så funkar det". */}
        <a href="#sa-funkar-det" className="start-scroll" aria-label="Till Så funkar det" onClick={scrollToSteps}>
          <PenArrow className="start-scroll-arrow" />
        </a>
      </section>

      <section className="start-section" id="sa-funkar-det">
        <h2 className="start-heading">Så funkar det</h2>
        <ol className="start-steps">
          {STEPS.map(({ title, text }, i) => (
            <li key={title} className="paper-note start-step">
              <span className="start-step-number" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="start-step-title">{title}</h3>
              <p className="start-step-text">{text}</p>
            </li>
          ))}
        </ol>
        <p className="start-pitch">Vi är ingen dejtingapp. Vi vill bara hjälpa dig att hitta på saker med andra!</p>
      </section>

      <section className="start-section start-map-section start-lined" id="kartan">
        <h2 className="start-heading">Det finns folk runt hörnet.</h2>
        <p className="start-section-text">
          Se vad som händer nära dig. Kanske finns din nästa klätterkompis, spelgrupp eller keramikklubb bara några
          kvarter bort.
        </p>
        <div className="start-map">
          <img src={karta} alt="Kartan i Intresseklubben, över Stockholm" className="start-map-image" />
          <span className="stamp start-map-stamp">Exempel</span>
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              className="map-activity is-event start-map-marker"
              style={{ '--x': `${event.x}%`, '--y': `${event.y}%`, '--mx': `${event.mx}%`, '--my': `${event.my}%` }}
              onClick={() => setOpenEvent(event)}
            >
              <img src={eventIcon} alt="" />
              <span className="map-activity-text">
                <span className="map-activity-name">{event.title}</span>
                <span className="map-activity-sub">{markerDate.format(new Date(event.starts_at)).replaceAll('.', '')}</span>
              </span>
            </button>
          ))}
          <span className="start-map-caption">Klicka på ett event!</span>
          {openEvent && (
            <MapPad title="Events" onClose={() => setOpenEvent(null)}>
              <DemoEventDetails event={openEvent} />
            </MapPad>
          )}
        </div>
      </section>

      <section className="start-section" id="intressen">
        <h2 className="start-heading">Hitta din grej.</h2>
        <p className="start-section-text">
          Över 900 intressen att välja bland, från klättring till K-pop. Och finns inte ditt lägger du till det själv.
        </p>
        {/* Tre rader som glider åt olika håll. Varje rad finns två gånger efter varandra, så att den går runt utan
            glapp; den andra är bara för synens skull. */}
        <div className="start-marquees">
          {INTEREST_ROWS.map((row, r) => (
            <div key={r} className={`start-marquee start-marquee-${r + 1}`}>
              {[0, 1].map((copy) => (
                <ul key={copy} className="interest-tags start-marquee-track" aria-hidden={copy === 1 || undefined}>
                  {row.map(([name, slug]) => (
                    <li key={name}>
                      <span className="interest-tag" style={areaColors(slug)}>
                        {name}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="start-section start-final start-lined">
        <div className="start-final-kompis" aria-hidden="true">
          <Intressekompis alt="" />
        </div>
        {/* En pratbubbla, som om kompisen säger det. Spetsen pekar mot hans mun. */}
        <div className="start-bubble">
          <svg className="start-bubble-tail" viewBox="0 0 40 30" aria-hidden="true">
            <path d="M40 6 C27 7, 13 6, 0 9 C13 13, 27 18, 40 24" />
          </svg>
          <h2 className="start-heading">Vi antecknar. Ni träffas.</h2>
          <p className="start-section-text">
            Ett intresse kan vara början på en vänskap. Hitta din klubb, upptäck ett event eller starta något eget.
          </p>
          <Link to="/registrera" className="primary-button button-large start-marker">
            Registrera dig
          </Link>
        </div>
      </section>

      <footer className="start-footer">
        <span className="start-footer-brand">Intresseklubben</span>
        <span>Gemenskap börjar med något gemensamt.</span>
        <nav className="start-footer-links" aria-label="Mer om Intresseklubben">
          <Link to="/om" className="quiet-link">
            Om tjänsten
          </Link>
          <Link to="/logga-in" className="quiet-link">
            Logga in
          </Link>
        </nav>
      </footer>
    </div>
  )
}

// Klotter i marginalerna kring rubriken, som när man ritar i kanten av ett anteckningsblock: en stjärna, en fotboll, ett
// hjärta och en kartnål med en streckad väg (som kartan i appen). Sparsamt, så att det inte blir barnsligt. Lappen med pilen mot knapparna ligger vid knapparna
// (.start-actions-note). Samma stil som klottret på Att göra
// (MarginDoodles i MapCalmPage): mörkt bläck och rundade streck. De kommer fram med polaroiderna (`shown`) och finns
// bara på en bred skärm, där det finns plats mellan polaroiderna och texten. Bara pynt.
function HeroDoodles({ shown }) {
  const star = 'M0 -9 L2.5 -2.5 L9 -2 L4 2.5 L5.5 9 L0 5.5 L-5.5 9 L-4 2.5 L-9 -2 L-2.5 -2.5 Z'
  return (
    <div className={`start-doodles${shown ? ' is-shown' : ''}`} aria-hidden="true">
      <svg className="start-doodle start-doodle-star" viewBox="-10 -10 20 20">
        <path d={star} />
      </svg>
      {/* En fotboll: en femhörning i mitten, sömmar ut till kanten och halva femhörningar längs kanten. */}
      <svg className="start-doodle start-doodle-ball" viewBox="-12 -12 24 24">
        <circle className="start-doodle-paper" r="11" />
        <path className="start-doodle-ink" d="M0 -4 L3.8 -1.2 L2.4 3.2 L-2.4 3.2 L-3.8 -1.2 Z" />
        <path d="M0 -4 V-8.5 M3.8 -1.2 L8 -2.8 M2.4 3.2 L5 7 M-2.4 3.2 L-5 7 M-3.8 -1.2 L-8 -2.8" />
        <path
          className="start-doodle-ink"
          d="M-2.6 -10.7 L0 -8.5 L2.6 -10.7 Z M8 -2.8 L10.8 -1 L10.2 -5 Z M5 7 L5.6 9.6 L8.4 7.4 Z M-5 7 L-5.6 9.6 L-8.4 7.4 Z M-8 -2.8 L-10.8 -1 L-10.2 -5 Z"
        />
      </svg>
      {/* En kartnål med en streckad väg under, som på kartan i appen. */}
      <svg className="start-doodle start-doodle-pin" viewBox="-14 -16 28 52">
        <path className="start-doodle-dashed" d="M0 14 C9 20, -9 25, 1 34" />
        <path className="start-doodle-pin-body" d="M0 12 C-6 4, -9 -1, -9 -5 A9 9 0 1 1 9 -5 C9 -1, 6 4, 0 12 Z" />
        <circle className="start-doodle-paper" cy="-5" r="3.2" />
      </svg>
      <svg className="start-doodle start-doodle-heart" viewBox="-12 -11 24 20">
        <path d="M0 7 C-9 0, -12 -6, -7 -9 C-4 -10, -1 -8, 0 -5 C1 -8, 4 -10, 7 -9 C12 -6, 9 0, 0 7 Z" />
      </svg>
    </div>
  )
}

// Ett påhittat event i blocket, som eventets egen vy i appen (EventDetails) fast utan svar och inbjudningar. Eftersom
// eventet inte finns lovar knappen inte just det, utan att man hittar liknande events när man har ett konto.
function DemoEventDetails({ event }) {
  const extras = eventExtrasText(event)
  return (
    <section className="detail-view">
      <div className="detail-main">
        <div className="title-row">
          <p className="card-title">{event.title}</p>
          <VisibilityStamp event={event} />
        </div>
        <p className="card-subheading">{eventWhenWhereText(event)}</p>
        {extras && <p className="hint-text">{extras}</p>}
        <InterestTags
          interests={[{ id: event.interest_id, name: event.interest_name, area_slug: event.interest_area_slug }]}
        />
        <p className="card-text">{event.description}</p>
        <p className="hint-text">
          Skapat av {event.creator_name}
          {event.group_name && ` i ${event.group_name}`}
        </p>
        <div className="card-actions">
          <Link to="/registrera" className="primary-button start-marker start-demo-signup">
            Registrera dig och hitta liknande
          </Link>
        </div>
        <p className="hint-text">Det här är ett påhittat exempel på hur ett event ser ut.</p>
      </div>
    </section>
  )
}

export default StartPage
