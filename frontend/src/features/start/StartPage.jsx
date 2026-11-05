import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import logo from '../../assets/intresseklubben.png'
import eventIcon from '../../assets/event.png'
import kompisHaDet from '../../assets/kompis-ha-det.webp'
import karta from '../../assets/startsida/karta.jpg'
import EmptyState from '../../shared/EmptyState'
import HandwrittenHeadline, { alreadyWritten } from './HandwrittenHeadline'
import InterestTags from '../interests/InterestTags'
import Intressekompis from '../../shared/Intressekompis'
import PenArrow from '../../shared/PenArrow'
import { eventExtrasText, eventWhenWhereText, VisibilityStamp } from '../events/EventList'
import { DEV_MODE } from '../../devtools/devMode'
import { useAuth } from '../../hooks/useAuth'
import { areaColors } from '../../utils/interestColors'
import { useGoBack } from '../../hooks/useCanGoBack'
import { AuthNote } from '../account/AuthPage'
import MapPad from '../../map/MapPad'
import '../../map/map.css'
import './startPage.css'

// "Logga in som ..." finns bara i testläget (npm run dev:test), och kommer inte ens med i en vanlig build.
const DevLogin = DEV_MODE ? lazy(() => import('../../devtools/DevLogin')) : null

// Startsidan. En lång sida: rubriken skrivs för hand (se HandwrittenHeadline) med polaroider runt, "Så funkar det" i tre steg,
// kartan med påhittade events, intressena och en sista uppmaning med Intressekompisen. Knapparna byter rubriken, texten
// och knapparna överst mot inloggningen eller registreringen (AuthNote, samma lapp som på /logga-in och /registrera);
// resten av sidan ligger kvar runt om och under, så att man kan scrolla vidare. Vad som visas står i adressen
// (?konto=logga-in eller ?konto=registrera), så att Tillbaka går tillbaka till rubriken och en länk dit öppnar lappen.
// Rubrikerna skrivs bara första gången per session.

const WRITTEN_KEY = 'intresseklubben.startsida-skriven'

// ?konto= i adressen och vilken lapp den visar (se AuthNote).
const KONTO = { 'logga-in': 'login', registrera: 'register' }
const KONTO_PARAM = { login: 'logga-in', register: 'registrera' }

// Testläget: /?skriv låter sidan röra sig också med "minska rörelse" påslaget i datorn. Rubriken skrivs och
// polaroiderna faller ändå bara första gången per session; för att se det igen, öppna sidan i en ny flik.
const alwaysWrite = () => DEV_MODE && new URLSearchParams(window.location.search).has('skriv')

// Polaroiderna i toppen: Nicks korta filmer, som spelas utan ljud i en slinga.
// Med "minska rörelse" (utom med ?skriv i testläget) visas stillbilden i stället; den syns också medan filmen laddas.
// Alla filmer i src/assets/startsida används, med stillbilden med samma namn (t.ex. dans.mp4 och dans.jpg): en ny film
// där kommer med av sig själv, och får sin bildtext i CAPTIONS. Fyra slumpas fram när sidan öppnas (se pickPolaroids),
// och varje gång Logga in eller Registrera dig visas eller tas bort byts de mot fyra nya bland dem som inte syns just då,
// så att man aldrig ser samma film direkt igen. De vänds en i taget som foton (se .is-flip-out och .is-flip-in i
// startPage.css).
const CAPTIONS = {
  dans: 'Dansa ihop',
  gaming: 'Gamingkväll',
  katt: 'Promenad med katten',
  klattra: 'Klättra med nya vänner',
  mat: 'Laga mat tillsammans',
  origami: 'Vika origami',
  saxo: 'Jamma ihop',
  spa: 'Spakväll!',
  spel: 'Spelkväll!',
  swim: 'Simma ihop',
}
const clipFiles = import.meta.glob('../../assets/startsida/*.mp4', { eager: true, import: 'default' })
const stillFiles = import.meta.glob('../../assets/startsida/*.jpg', { eager: true, import: 'default' })
const CLIPS = Object.entries(clipFiles).map(([path, clip]) => {
  const name = path.split('/').pop().replace(/\.mp4$/, '')
  return { name, clip, image: stillFiles[path.replace(/\.mp4$/, '.jpg')], caption: CAPTIONS[name] ?? '' }
})

// Lutningen hör till platsen (första, andra ...), inte till filmen, så att polaroiderna ligger likadant vilka det än är.
const POLAROID_TILTS = [-7, 6, 5, -4]

// Fyra olika filmer ur CLIPS i slumpad ordning, utan någon av dem i `shown` (de som syns nu).
function pickPolaroids(shown = []) {
  const shuffled = CLIPS.filter((clip) => !shown.includes(clip))
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, POLAROID_TILTS.length)
}

// Hur länge polaroiderna vänds bort (sista polaroiden räknad, se --order) innan de nya sätts in, och hur länge de nya
// vänds fram och framkallas. Samma tider som i startPage.css.
const FLIP_OUT_MS = 260 + 3 * 90
const FLIP_IN_MS = 3 * 90 + 200 + 1200
// Hur länge introt håller på när polaroiderna har kommit: alla har fallit ned och framkallats (sista polaroiden
// räknad). Samma tider som i startPage.css.
const INTRO_MS = 3 * 150 + 350 + 1800

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
  // går man tillbaka till sidan ligger de redan där. Introt tas bort när polaroiderna har landat (se nedan).
  const [animated] = useState(() => alwaysWrite() || !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [intro, setIntro] = useState(() => animated && !alreadyWritten(WRITTEN_KEY))
  const events = useMemo(demoEvents, [])
  // Polaroiderna som syns. Nya väljs varje gång de byts (se nedan).
  const [polaroids, setPolaroids] = useState(() => pickPolaroids())
  const [searchParams, setSearchParams] = useSearchParams()
  const authMode = KONTO[searchParams.get('konto')] ?? null
  const location = useLocation()
  const navigate = useNavigate()
  const justRegistered = Boolean(location.state?.justRegistered)
  // Precis utloggad (Logga ut i menyn skickar med det): kompisen säger "Ha det!" i stället för rubriken, bara tills man
  // öppnar Logga in eller Registrera dig. Beskedet tas bort ur historiken direkt, så att rubriken är tillbaka när man
  // laddar om sidan eller går tillbaka till den.
  const [loggedOut, setLoggedOut] = useState(() => Boolean(location.state?.loggedOut))
  useEffect(() => {
    if (location.state?.loggedOut) navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location, navigate])
  // Adressen med rutan öppen (eller bytt), med resten av ?-delen kvar (t.ex. ?skriv i testläget).
  const withKonto = (mode) => {
    const next = new URLSearchParams(searchParams)
    if (mode) next.set('konto', KONTO_PARAM[mode])
    else next.delete('konto')
    return next
  }
  // Stäng: tillbaka till rubriken, eller ta bort ?konto om lappen visades redan när sidan öppnades.
  const closeAuth = useGoBack(() => setSearchParams(withKonto(null), { replace: true }))
  const authLink = (mode) => ({ search: `?${withKonto(mode)}` })
  // Polaroiderna och klottret kommer när rubriken är skriven. Står lappen eller kompisen i stället för rubriken ligger
  // de där direkt.
  const shown = headlineDone || authMode !== null || loggedOut

  // Polaroiderna byts när lappen visas eller tas bort: de gamla vänds bort ('out'), sedan sätts de nya in och vänds fram
  // ('in'). Med "minska rörelse" byts de direkt. Visas lappen redan när sidan öppnas ligger de nya där från början.
  const wantedSet = authMode ? 'auth' : 'start'
  const [polaroidSet, setPolaroidSet] = useState(wantedSet)
  const [flip, setFlip] = useState(null)
  useEffect(() => {
    if (wantedSet === polaroidSet) {
      // Tillbaka innan de hann bytas: vänd fram de som redan ligger där.
      setFlip((current) => (current === 'out' ? 'in' : current))
      return undefined
    }
    if (!animated) {
      setPolaroidSet(wantedSet)
      setPolaroids(pickPolaroids)
      return undefined
    }
    setFlip('out')
    const timer = setTimeout(() => {
      setPolaroidSet(wantedSet)
      setPolaroids(pickPolaroids)
      setFlip('in')
    }, FLIP_OUT_MS)
    return () => clearTimeout(timer)
  }, [wantedSet, polaroidSet, animated])
  useEffect(() => {
    if (flip !== 'in') return undefined
    const timer = setTimeout(() => setFlip(null), FLIP_IN_MS)
    return () => clearTimeout(timer)
  }, [flip])

  // När polaroiderna har landat och framkallats är introt slut, och .is-intro tas bort. Annars gäller regeln för
  // landningen fortfarande, och den börjar om så fort något annat släpper polaroiden (t.ex. när en vändning är klar
  // och .is-flip-in tas bort): då försvann de ett ögonblick och landade igen. Vänds de innan introt är slut tas det
  // bort direkt, eftersom vändningen ändå tar över.
  useEffect(() => {
    if (!intro || !shown) return undefined
    if (flip) {
      setIntro(false)
      return undefined
    }
    const timer = setTimeout(() => setIntro(false), INTRO_MS)
    return () => clearTimeout(timer)
  }, [intro, shown, flip])

  // Lappen ligger överst: öppnas den längre ned (t.ex. Logga in i sidfoten) scrollar sidan upp till den.
  useEffect(() => {
    if (!authMode) return
    window.scrollTo({ top: 0, behavior: animated ? 'smooth' : 'auto' })
    setLoggedOut(false)
  }, [authMode, animated])

  // Redan inloggad: inget att göra här, skicka vidare till kartan.
  if (loading) return null
  if (user) return <Navigate to="/hem" replace />

  return (
    <div className={`start-page${animated ? ' is-animated' : ''}${intro ? ' is-intro' : ''}`}>
      <section className="start-hero start-lined">
        <img src={logo} alt="Intresseklubben" className="start-logo" />
        {/* Logga in eller Registrera dig: lappen i stället för rubriken, texten och knapparna. Precis utloggad: kompisen
            som säger "Ha det!" i stället för rubriken. */}
        {authMode ? (
          <AuthNote
            // En ny lapp när man byter, så att "Glömt lösenord?" inte står kvar.
            key={authMode}
            mode={authMode}
            justRegistered={justRegistered}
            onSwitch={(mode, state) => setSearchParams(withKonto(mode), { replace: true, state })}
            onClose={closeAuth}
          />
        ) : loggedOut ? (
          <EmptyState
            className="start-farewell"
            image={kompisHaDet}
            title="Du är utloggad"
            text="Välkommen tillbaka när du vill!"
          />
        ) : (
          <HandwrittenHeadline
            lines={['Vi antecknar,', 'ni träffas.']}
            storageKey={WRITTEN_KEY}
            always={alwaysWrite()}
            className="start-headline"
            onDone={() => setHeadlineDone(true)}
          />
        )}

        <HeroDoodles shown={shown} />

        <ul className={`start-polaroids${shown ? ' is-shown' : ''}${flip ? ` is-flip-${flip}` : ''}`} aria-hidden="true">
          {polaroids.map(({ name, image, clip, caption }, i) => (
            <li
              key={name}
              className={`start-polaroid start-polaroid-${i + 1}`}
              style={{ '--tilt': `${POLAROID_TILTS[i]}deg`, '--order': i }}
            >
              {/* Bilden i en egen ram, så att framkallningen kan ligga som ett blekt lager ovanpå (se startPage.css). */}
              <span className="start-polaroid-photo">
                {playClips() ? (
                  <PolaroidClip clip={clip} image={image} />
                ) : (
                  <img src={image} alt="" />
                )}
              </span>
              <span className="start-polaroid-caption">{caption}</span>
            </li>
          ))}
        </ul>

        {!authMode && (
          <>
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
              <Link to={authLink('register')} className="primary-button button-large start-marker">
                Registrera dig
              </Link>
              <Link to={authLink('login')} className="secondary-button button-large start-marker">
                Logga in
              </Link>
            </div>
          </>
        )}
        {/* En handritad pil längst ned i fönstret, till "Så funkar det". */}
        <a href="#sa-funkar-det" className="start-scroll" aria-label="Till Så funkar det" onClick={scrollToSteps}>
          <PenArrow className="start-scroll-arrow" />
        </a>
      </section>

      {DevLogin && (
        <Suspense fallback={null}>
          <DevLogin />
        </Suspense>
      )}

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
          <Link to={authLink('register')} className="primary-button button-large start-marker">
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
          <Link to={authLink('login')} className="quiet-link">
            Logga in
          </Link>
        </nav>
      </footer>
    </div>
  )
}

// En av polaroidernas filmer, utan ljud och i en slinga. iPhone spelar bara upp en film av sig själv om den har
// attributet muted redan när den läggs in, och React sätter bara egenskapen. Då visar telefonen en play-knapp i
// stället, tills man har rört skärmen (därför spelade de efter Logga in). Här sätts attributet innan filmen startas,
// och filmen startas också uttryckligen. Säger telefonen ändå nej (t.ex. i strömsparläge) försöker den igen vid
// första trycket, och tills dess syns stillbilden utan play-knapp (se .start-polaroid video i startPage.css).
function PolaroidClip({ clip, image }) {
  const ref = useRef(null)
  useEffect(() => {
    const video = ref.current
    video.muted = true
    video.defaultMuted = true
    video.setAttribute('muted', '')
    const play = () => video.play().catch(() => {})
    play()
    // Bara händelser som räknas som att man har rört sidan (inte pointerdown på en pekskärm).
    const GESTURES = ['touchend', 'click', 'keydown']
    const retry = () => {
      if (video.paused) play()
      GESTURES.forEach((name) => window.removeEventListener(name, retry))
    }
    GESTURES.forEach((name) => window.addEventListener(name, retry))
    return () => GESTURES.forEach((name) => window.removeEventListener(name, retry))
  }, [clip])
  return <video ref={ref} src={clip} poster={image} autoPlay muted loop playsInline preload="auto" />
}

// Klotter i marginalerna kring rubriken, som när man ritar med tusch i kanten av ett anteckningsblock: en smiley, ett
// hjärta med en pil, en pratbubbla, en spiral, en blixt, en stjärna, ett luffarschack, en kristall, en vågig slinga, det
// klassiska S:et och en musiknot, och längre ut ett gnistrande stjärnfall, en måne, en tärning och en bock i en ruta.
// Var och en en gång, i olika storlekar. Bara linjer i bläckfärgen, lite
// ojämna som för hand. Lappen med pilen mot knapparna ligger vid knapparna (.start-actions-note). De kommer fram med
// polaroiderna (`shown`) och finns bara på en bred skärm, där det finns plats mellan polaroiderna och texten; de längst
// ut mot kanterna bara när skärmen är bred nog (.start-doodle-wide och .start-doodle-xwide). Bara pynt.
// Det klassiska S:et, ritat lite ojämnt: spetsen upptill, tre streck, snedstrecken i mitten, tre streck och spetsen
// nedtill (i en ruta 12 bred och 35 hög).
const COOL_S =
  'M0.2 7.2 L6 0.2 L11.9 6.8 M0.2 7.2 L0 14 M6.1 7 L6 14.2 M11.9 6.8 L12 14 ' +
  'M0 14 L6.1 21 M6 14.2 L12.1 21.2 M12 14 L9 17.6 M0 21.1 L3 17.4 ' +
  'M0 21.1 L0.1 28 M6.1 21 L6 28.1 M12.1 21.2 L11.9 28 M0.1 28 L6 34.8 L11.9 28'
// En kristall: kronan med fasetter upptill och en spets nedåt.
const GEM = 'M2.2 0.2 L9.9 0 L12 4.1 L6.1 16 L0 4 Z M0 4 L12 4.1 M2.2 0.2 L4 4 L6 0.1 L8 4.1 L9.9 0 M4 4 L6.1 16 M8 4.1 L6.1 16'
// Spiralen, blixten och smileyn (ansiktet, ögonen och munnen i ett).
const SPIRAL =
  'M0.2 0.4 C1.6 -0.8 2.6 1 1.3 2.2 C-0.6 3.8 -3.5 2.1 -3.4 -0.4 C-3.3 -3.6 0.6 -5.1 3.4 -3.7 C6.7 -2 6.7 3.1 3.8 5.3 C0.4 7.9 -5.4 6.9 -7.3 2.9 C-9.4 -1.6 -6.5 -7.5 -1 -8.5 C3 -9.3 7.4 -7.7 9.3 -4.4'
const BOLT = 'M2.4 -11 L-5.6 2.2 L0 1.5 L-3.4 11.2 L6.2 -2.8 L0.4 -2.2 L4.6 -10.9 Z'
const SMILEY =
  'M0.6 -10.4 C6.6 -10.7 10.6 -6 10.4 0.3 C10.2 6.4 5.8 10.6 -0.4 10.4 C-6.5 10.2 -10.5 5.8 -10.3 -0.4 C-10.1 -6.3 -6 -10.1 1.2 -10 ' +
  'M-3.5 -4.4 L-3.4 -1.6 M3.2 -4.6 L3.3 -1.8 M-5.8 2.2 C-3.8 6.6 3.6 6.9 6 1.8'
// En vågig slinga.
const SQUIGGLE = 'M0 0.4 C2.6 -4.6 5.4 4.8 8.2 0 C10.8 -4.4 13.6 4.6 16.4 -0.2 C19 -4.6 21.8 4.4 24.6 -0.4 C25.8 -2.4 27 -2.6 28 -1.6'

function HeroDoodles({ shown }) {
  return (
    <div className={`start-doodles${shown ? ' is-shown' : ''}`} aria-hidden="true">
      <svg className="start-doodle start-doodle-smiley" viewBox="-12 -12 24 24">
        <path d={SMILEY} />
      </svg>
      {/* Pilen går in bakom hjärtat: bara skaftet utanför syns, med fjädrarna nere till vänster och spetsen uppe till höger. */}
      <svg className="start-doodle start-doodle-heart" viewBox="-17 -12 34 24">
        <path d="M0.2 8.4 C-6.6 2.6 -10.2 -2.4 -8 -6.2 C-5.8 -9.6 -1.6 -8.6 0.1 -4.6 C1.4 -8.6 5.6 -10.2 8.1 -7 C10.6 -3.6 7.2 2 0.2 8.4" />
        <path d="M-15 6.4 L-6.8 3 M4.6 -1.6 L14.4 -6" />
        <path d="M14.8 -6.2 L10.6 -6.8 M14.8 -6.2 L12.4 -2.8" />
        <path d="M-13.6 5.8 L-15.4 2.8 M-11.4 4.9 L-13 2 M-13.4 5.9 L-14.2 9 M-11.2 5 L-11.9 8" />
      </svg>
      <svg className="start-doodle start-doodle-bubble" viewBox="-13 -10 26 20">
        <path d="M-0.8 -8.6 C6.6 -8.9 11.6 -6 11.5 -1.4 C11.4 3.1 6.4 5.5 -0.2 5.4 C-1.8 5.4 -3.2 5.2 -4.5 4.9 L-8.8 8.8 L-7.2 3.8 C-10.2 2.4 -11.7 0.4 -11.5 -2 C-11.1 -6.1 -6.6 -8.4 -0.8 -8.6" />
        <circle className="start-doodle-dot" cx="-4" cy="-1.6" r="1.15" />
        <circle className="start-doodle-dot" cx="0" cy="-1.7" r="1.15" />
        <circle className="start-doodle-dot" cx="4" cy="-1.8" r="1.15" />
      </svg>
      <svg className="start-doodle start-doodle-spiral" viewBox="-11 -11 22 22">
        <path d={SPIRAL} />
      </svg>
      <svg className="start-doodle start-doodle-bolt" viewBox="-8 -12 16 24">
        <path d={BOLT} />
      </svg>
      {/* En femuddig stjärna ritad med ett enda drag, som man gör i marginalen. */}
      <svg className="start-doodle start-doodle-star" viewBox="-10 -10 20 20">
        <path d="M-0.4 -9 L5.4 7.6 L-8.8 -2.4 L8.9 -3 L-5.7 7.3 L0.1 -8.4" />
      </svg>
      <svg className="start-doodle start-doodle-tictactoe" viewBox="-12 -12 24 24">
        <path d="M-3.4 -10.6 L-4.1 10.6 M4.3 -10.8 L3.7 10.4 M-10.7 -3.3 L10.6 -3.8 M-10.9 4.3 L10.4 3.8" />
        <path d="M-9.4 -9.5 L-6.1 -6 M-5.9 -9.6 L-9.3 -5.8" />
        <path d="M7.4 -9.7 C9.6 -9.7 9.9 -5.3 7.2 -5.2 C4.9 -5.1 4.8 -9.6 7.4 -9.7" />
        <path d="M0.2 -2.1 C2.3 -2.1 2.6 2.1 0 2.2 C-2.3 2.3 -2.4 -2.1 0.2 -2.1" />
        <path d="M5.9 6 L9.4 9.7 M9.6 6 L6.1 9.5" />
      </svg>
      {/* Det klassiska S:et: tre lodräta streck upptill och nedtill, spetsar i båda ändarna och snedstreck emellan. */}
      <svg className="start-doodle start-doodle-cool-s" viewBox="-3 -3 19 42">
        <path d={COOL_S} />
      </svg>
      <svg className="start-doodle start-doodle-gem" viewBox="-1 -1 14 18">
        <path d={GEM} />
      </svg>
      <svg className="start-doodle start-doodle-squiggle" viewBox="-1 -6 30 12">
        <path d={SQUIGGLE} />
      </svg>
      {/* En åttondelsnot: huvudet, skaftet och flaggan. */}
      <svg className="start-doodle start-doodle-note" viewBox="-8 -12 16 24">
        <path d="M3 6.2 C3.2 9.6 -4 10.6 -4.4 7.6 C-4.8 4.6 2.2 3.2 3 6.2 L3.1 -10.2 C4.8 -6.6 8.6 -5.6 7 -1.2" />
      </svg>
      {/* Ett gnistrande stjärnfall: fyra mjukt inåtböjda uddar. */}
      <svg className="start-doodle start-doodle-wide start-doodle-sparkle" viewBox="-11 -11 22 22">
        <path d="M0 -10 C0.8 -3 3 -0.8 10 0 C3 0.8 0.8 3 0 10 C-0.8 3 -3 0.8 -10 0 C-3 -0.8 -0.8 -3 0 -10 Z" />
      </svg>
      <svg className="start-doodle start-doodle-wide start-doodle-moon" viewBox="-11 -11 22 22">
        <path d="M3 -9.6 C-4 -10.5 -9.8 -4.6 -9.4 1.8 C-9 7.6 -3.4 10.6 2.6 9.6 C6 9 8.4 7 9.6 4.4 C4.6 6.4 -1.8 4 -3.2 -1.6 C-4.2 -5.6 -1.4 -8.8 3 -9.6 Z" />
      </svg>
      <svg className="start-doodle start-doodle-xwide start-doodle-dice" viewBox="-11 -11 22 22">
        <path d="M-7.6 -8.4 C-2 -8.6 3 -8.4 7.8 -8 C8.4 -2.6 8.4 2.6 8 8.2 C2.6 8.6 -2.6 8.4 -8 8 C-8.4 2.4 -8.4 -2.8 -7.6 -8.4" />
        <circle className="start-doodle-dot" cx="-4" cy="-4" r="1.3" />
        <circle className="start-doodle-dot" cx="4" cy="-4.2" r="1.3" />
        <circle className="start-doodle-dot" cx="0.1" cy="0" r="1.3" />
        <circle className="start-doodle-dot" cx="-4.1" cy="4.1" r="1.3" />
        <circle className="start-doodle-dot" cx="4" cy="4" r="1.3" />
      </svg>
      {/* En bock som sticker ut ur sin ruta, som när man bockar av något. */}
      <svg className="start-doodle start-doodle-xwide start-doodle-check" viewBox="-11 -11 22 22">
        <path d="M3.8 -6.2 L-8.8 -6 L-9.1 8 L5 8.3 L5.1 2" />
        <path d="M-5.2 0 L-1 4.6 L10 -9.2" />
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
          {/* Öppnar registreringen överst på startsidan (se StartPage). */}
          <Link to={{ search: '?konto=registrera' }} className="primary-button start-marker start-demo-signup">
            Registrera dig och hitta liknande
          </Link>
        </div>
        <p className="hint-text">Det här är ett påhittat exempel på hur ett event ser ut.</p>
      </div>
    </section>
  )
}

export default StartPage
