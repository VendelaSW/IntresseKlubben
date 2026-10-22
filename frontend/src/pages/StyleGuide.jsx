import { useState } from 'react'
import { InterestPrompt } from '../components/AddInterest'
import brevIcon from '../assets/brev.png'
import eventIcon from '../assets/event.png'
import hemIcon from '../assets/hem.png'
import klubbarIcon from '../assets/klubbar.png'
import logo from '../assets/intresseklubben.png'
import notiserIcon from '../assets/notiser.svg'
import personerIcon from '../assets/personer.png'
import Avatar from '../components/Avatar'
import Intressekompis from '../components/Intressekompis'
import LocationPicker from '../components/LocationPicker'
import BackButton from '../components/BackButton'
import ChatSender from '../components/ChatSender'
import ConversationCard from '../components/ConversationCard'
import CreateButton from '../components/CreateButton'
import Modal from '../components/Modal'
import MunicipalityPicker from '../components/MunicipalityPicker'
import BirthDatePicker from '../components/BirthDatePicker'
import FormField from '../components/FormField'
import InterestTree, { profileTree } from '../components/InterestTree'
import ProfileAbout from '../components/ProfileAbout'
import TextareaWithCount from '../components/TextareaWithCount'
import { NotificationDetails, NotificationRow } from './NotificationsPage'

const NAV_ICONS = [
  { icon: hemIcon, label: 'Hem' },
  { icon: brevIcon, label: 'Brev' },
  { icon: personerIcon, label: 'Personer' },
  { icon: klubbarIcon, label: 'Klubbar' },
  { icon: eventIcon, label: 'Events' },
]

const COLORS = [
  { name: '--color-bg', hex: '#f7f1e3', label: 'Bakgrund' },
  { name: '--color-text', hex: '#1a1a1a', label: 'Text' },
  { name: '--color-accent', hex: '#f4c430', label: 'Accent' },
  { name: '--color-accent-soft', hex: '#fdf6e0', label: 'Blekgul (Om mig-ruta)' },
  { name: '--color-line', hex: '#bfd7ed', label: 'Kantlinje' },
  { name: '--color-white', hex: '#ffffff', label: 'Vit (kort/boxar)' },
  { name: '--color-muted', hex: '#6b6b6b', label: 'Dämpad (platshållartext)' },
  { name: '--color-success', hex: '#3b6d11', label: 'Success (bekräftelser)' },
  { name: '--color-error', hex: '#a32d2d', label: 'Error (felmeddelanden)' },
  { name: '--color-paper', hex: '#f5eddc', label: 'Brevpapper (aningen mörkare än bakgrunden)' },
  { name: '--color-paper-margin', hex: '#e7a1a1', label: 'Brevpapprets röda marginal' },
  { name: '--color-envelope-inside', hex: '#eef3f8', label: 'Kuvertets insida' },
]

// Exempel för Brev-avsnittet: ett nytt och ett öppnat kuvert.
const EXAMPLE_CONVERSATIONS = [
  { id: 1, name: 'Bob', username: 'bob', last_message_at: new Date().toISOString(), last_message_from_me: false, isNew: true },
  { id: 2, name: 'Cecilia', username: 'cecilia', last_message_at: '2025-10-06T18:02:00Z', last_message_from_me: true, isNew: false },
]

// Exempel för Notiser-avsnittet: en oläst och en läst notis, och en öppnad med citat och länk.
const EXAMPLE_NOTIFICATIONS = [
  { id: 1, title: '«Fotbollsträffen» har ställts in', read: false, created_at: new Date().toISOString() },
  { id: 2, title: '«Brädspelskväll» har fått ny tid', read: true, created_at: '2025-10-06T18:02:00Z' },
]
const EXAMPLE_NOTIFICATION = {
  id: 3,
  title: '«Fotbollsträffen» har ställts in',
  body: 'Bob har tagit bort eventet som du skulle gå på.',
  quote: 'Inställt pga sjukdom, vi ses nästa vecka!',
  quote_by: 'Bob',
  link: '/stilguide',
  read: true,
  created_at: new Date().toISOString(),
}

const SIZES = [
  { name: '--text-hero', rem: '5rem', label: 'Hero', font: 'heading', weight: 700 },
  { name: '--text-h1', rem: '4rem', label: 'H1 / Sidrubrik', font: 'heading', weight: 700 },
  { name: '--text-card-title', rem: '2.25rem', label: 'Kort-titel (t.ex. namn i en box)', font: 'heading', weight: 700 },
  { name: '--text-h2', rem: '1.25rem', label: 'H2 / Överrubriker', font: 'body', weight: 700 },
  { name: '--text-subheading', rem: '1.05rem', label: 'Underrubrik', font: 'body', weight: 700 },
  { name: '--text-body', rem: '1rem', label: 'Brödtext', font: 'body', weight: 400 },
  { name: '--text-small', rem: '0.85rem', label: 'Finstilt', font: 'body', weight: 400 },
]

// Några kommuner för kommunfältets exempel (de riktiga kommer från /municipalities/).
const EXAMPLE_MUNICIPALITIES = [
  { code: '1480', name: 'Göteborg' },
  { code: '1401', name: 'Härryda' },
  { code: '2361', name: 'Härjedalen' },
  { code: '2280', name: 'Härnösand' },
  { code: '1481', name: 'Mölndal' },
  { code: '0180', name: 'Stockholm' },
  { code: '0120', name: 'Värmdö' },
]

function StyleGuide() {
  const [exampleText, setExampleText] = useState('')
  const [exampleMunicipality, setExampleMunicipality] = useState('')
  const [exampleBirthDate, setExampleBirthDate] = useState('')
  const [filterMunicipality, setFilterMunicipality] = useState('')
  const [compactText, setCompactText] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [examplePosition, setExamplePosition] = useState(null)

  return (
    <div className="page">
      <img src={logo} alt="Intresseklubben" className="logo" />
      <h1>Stilguide</h1>
      <p className="problem-statement">
        Färger, typsnitt och komponenter som redan används i Intresseklubben.
        Ändra i <code>styles/index.css</code>, den här sidan speglar bara det.
      </p>

      <section className="style-section">
        <h2>Färger</h2>
        <div className="swatch-grid">
          {COLORS.map((color) => (
            <div className="swatch" key={color.name}>
              <div className="swatch-color" style={{ background: `var(${color.name})` }} />
              <p className="swatch-label">{color.label}</p>
              <p className="swatch-code">{color.name}</p>
              <p className="swatch-code">{color.hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="style-section">
        <h2>Typografi</h2>
        <p className="tagline" style={{ fontSize: '2.5rem', marginTop: '1.5rem' }}>Caveat</p>
        <p className="problem-statement">
          Stora, personliga rubriker: Hero, sidrubrik (H1) och namn i boxar.
        </p>
        <p className="hint-text">
          Caveat lutar, så sista bokstaven och svansarna på g, j och y sticker ut utanför textens ruta. Caveat-text
          som kortas av (med "…" eller efter ett antal rader) ska läggas till i den gemensamma regeln i index.css
          (se .map-profile-name där), annars klipps bokstäverna.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: '2.5rem',
            margin: '1.5rem 0 0',
          }}
        >
          Inter
        </p>
        <p className="problem-statement">
          Allt annat: brödtext, knappar, länkar, sektionsrubriker och underrubriker.
        </p>
        <a href="#" className="info-link" style={{ marginTop: '1rem' }} onClick={(e) => e.preventDefault()}>
          Länk-stil (info-link)
        </a>
        <p className="swatch-code">Inter Bold, gul understrykning, tonas ner vid hover</p>
      </section>

      <section className="style-section">
        <h2>Storlekar</h2>
        {SIZES.map((size) => (
          <div key={size.name} style={{ marginBottom: '1.5rem' }}>
            <p
              style={{
                fontFamily: size.font === 'heading' ? 'var(--font-heading)' : 'var(--font-body)',
                fontWeight: size.weight,
                fontSize: `var(${size.name})`,
                margin: 0,
              }}
            >
              {size.label}
            </p>
            <p className="swatch-code">{size.name} · {size.rem}</p>
          </div>
        ))}
      </section>

      <section className="style-section">
        <h2>Knappar</h2>
        <p className="swatch-label">Typsnitt: Inter (versaler, bokstavsavstånd)</p>
        <div className="account-choice-links" style={{ marginTop: '1rem' }}>
          <a href="#" className="account-choice-link" onClick={(e) => e.preventDefault()}>
            Sekundär knapp
          </a>
          <button className="primary-button" type="button">
            Primär knapp
          </button>
        </div>
        <p className="swatch-label" style={{ marginTop: '1.5rem' }}>Liten variant (.button-small)</p>
        <div className="account-choice-links" style={{ marginTop: '1rem' }}>
          <a href="#" className="account-choice-link button-small" onClick={(e) => e.preventDefault()}>
            Sekundär
          </a>
          <button className="primary-button button-small" type="button">
            Primär
          </button>
        </div>
        <p className="swatch-label" style={{ marginTop: '1.5rem' }}>Stor variant (.button-large)</p>
        <p className="hint-text">
          För den knapp som ska synas mest i ett steg, t.ex. "Skapa min profil". Andra val bredvid
          blir små (.button-small), så att man inte trycker fel.
        </p>
        <div className="account-choice-links" style={{ marginTop: '1rem' }}>
          <button className="primary-button button-large" type="button">
            Primär
          </button>
        </div>
        <p className="swatch-label" style={{ marginTop: '1.5rem' }}>Skapa-knapp (CreateButton, .create-button)</p>
        <div className="account-choice-links" style={{ marginTop: '1rem' }}>
          <CreateButton label="Skapa klubb" onClick={() => {}} />
        </div>
      </section>

      <section className="style-section">
        <h2>Taggar</h2>
        <p className="hint-text">
          Kontur = ej vald, klicka för att välja. Fylld gul = vald, klicka igen för att ta bort.
          Hovra med musen för att se de två extra hover-lägena, de syns inte i en stillbild.
        </p>
        <ul className="tags" style={{ marginTop: '1rem' }}>
          <li><button type="button" className="tag">Ej vald</button></li>
          <li><button type="button" className="tag tag-selected">Vald</button></li>
        </ul>

        <h3>Intressetaggar (components/InterestTagGroup.jsx)</h3>
        <p className="hint-text">
          Intressen på profiler, personkort, klubbar, events och i intervjun (.interest-tag, inte .tag). Färgen följer
          huvudområdet (utils/interestColors.js): en fyllning per område och en ljusare nyans för underintressen. Mörk
          kant, handritad form och hård skugga som kartans lappar. Den ritade pilen (DrawnArrow) betyder att intresset har underintressen; ett tryck
          lägger dem i en ruta över taggarna under. Allt man valt syns, och varje intresse är en egen tagg tills fler än
          tre ligger under samma kategori; då samlas de i den (utils/interestGroups.js), den närmaste kategorin först
          (fyra mysiga spel blir Mysiga spel ▼, också om man inte valt Mysiga spel). Gemensamma intressen har fetstil
          och en bock på gul botten. På Min profil har taggarna × bara efter "Redigera", och intressen läggs till med
          sökrutan direkt i kortet eller i Intressebiblioteket (InterestLibrary, över hela blocket). Där är intressena
          taggar att trycka på (.interest-pick: ljus nyans och + när de inte är valda, områdets färg och ✓ när de är
          valda), och pilen efter den streckade linjen öppnar underintressena i samma ruta som här. Tryck på Historia
          (fyra under den) och se Fotografering (bara tre under Skapande):
        </p>
        <InterestTree
          proposals={profileTree([
            { id: 1, name: 'Historia', parent_id: null, path: [] },
            { id: 2, name: 'Mynt', parent_id: 1, path: ['Historia'] },
            { id: 3, name: 'Vikingatiden', parent_id: 1, path: ['Historia'] },
            { id: 4, name: 'Medeltiden', parent_id: 1, path: ['Historia'] },
            { id: 5, name: 'Antiken', parent_id: 1, path: ['Historia'] },
            { id: 6, name: 'Metal', parent_id: 7, path: ['Musik', 'Rock'] },
            { id: 8, name: 'Löpning', parent_id: 10, path: ['Sport och träning'] },
            { id: 9, name: 'Fotografering', parent_id: 11, path: ['Skapande'] },
            { id: 12, name: 'Analog fotografering', parent_id: 9, path: ['Skapande', 'Fotografering'] },
          ])}
          align="start"
          highlight={new Set(['id:2', 'id:8'])}
        />

        <h3>Lägg till ett intresse (components/AddInterest.jsx)</h3>
        <p className="hint-text">
          Finns intresset inte i biblioteket erbjuds man att lägga till det med egna ord (högst 40 tecken). Backend
          kontrollerar det och väljer en förälder, och godkänns det visas den här frågan. Godkänns det inte visas bara
          ett felmeddelande. Samma kärna används på profilen (i utforskaren) och i intervjun (en egen ruta).
        </p>
        <InterestPrompt
          proposals={[
            { key: 'p1', label: null, activity: '', interest: { id: null, name: 'Bananskalning', path: ['Mat och dryck'], is_new: true, parent_key: null } },
          ]}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
        <p className="form-error" style={{ marginTop: '0.75rem' }}>
          Detta intresse godkänns inte, försök med ett annat.
        </p>
      </section>

      <section className="style-section">
        <h2>Ikoner</h2>
        <p className="swatch-label">
          Handritade, matchar loggans stil (.nav-icon). Ikon ovanför text, används i huvudmenyn.
          På smala skärmar krymper ikonerna, texten och luften mellan menypunkterna steglöst
          (clamp), så att alla ryms på en rad ned till 320 px. Från ca 400 px gäller de vanliga
          måtten: 34 px ikon, 0,8 rem text. Innan profilen är klar är menypunkterna låsta
          (.app-nav-link-locked): nedtonade och inte klickbara.
        </p>
        <div className="swatch-grid" style={{ marginTop: '1rem' }}>
          {NAV_ICONS.map(({ icon, label }) => (
            <div className="swatch" key={label}>
              <span className="app-nav-link" style={{ padding: 0 }}>
                <img src={icon} alt="" className="nav-icon" />
                <span className="app-nav-label">{label}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="style-section">
        <h2>Boxar</h2>
        <p className="swatch-label">Vanligt kort (.card)</p>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-avatar" />
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <p className="card-text">Gillar brädspel, klättring och katter.</p>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Avatar (components/Avatar.jsx)
        </p>
        <p className="hint-text">
          En persons bild, eller initialen i en blå cirkel om bild saknas. Använd komponenten i stället
          för att skriva egen markering. Storleken ges med en klass: .person-list-avatar (liten, i
          listor) eller .card-avatar (på kort).
        </p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <Avatar name="Emmy" className="person-list-avatar" />
          <Avatar name="Emmy Lund" className="card-avatar" maxLetters={2} />
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Platsväljare (components/LocationPicker.jsx)
        </p>
        <p className="hint-text">
          Var på kartan ett event eller en klubbs träffplats är. "Hitta adressen på kartan" söker på queries i tur och
          ordning (GET /geocode, kräver inloggning) och sätter en nål; nålen går att dra eller flytta med ett klick.
          Utan nål visas kommunCode:s kommun, annars hela Sverige. value är {'{ latitude, longitude }'} eller null.
          Kartan laddas först när komponenten visas.
        </p>
        <div className="auth-form form-wide" style={{ marginTop: '0.5rem' }}>
          <LocationPicker
            id="styleguide-position"
            queries={['Odelbergs väg 2, Värmdö']}
            value={examplePosition}
            onChange={setExamplePosition}
            saveLabel="Spara"
            kommunCode="0120"
          />
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Intressekompisen (components/Intressekompis.jsx)
        </p>
        <p className="hint-text">
          Maskoten, med pupiller som följer muspekaren. Fyller bredden på sin förälder och behåller proportionerna, så
          storleken ges med `width` (till exempel "200px") eller genom förälderns bredd. Rent dekorativ: ge den alt=""
          där den bara pryder. Pupillerna står stilla för den som valt mindre rörelse i systemet. Ingen egen CSS, allt
          ligger i komponenten.
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end', marginTop: '0.5rem' }}>
          <Intressekompis width="200px" />
          <Intressekompis width="90px" alt="" />
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Klickbart kort (.card .card-interactive), t.ex. en tumnagel i personlistan
        </p>
        <p className="hint-text">
          Hovra med musen: kortet lyfts och får gul kant och skugga. Används bara på kort
          som går att klicka på, inte på kort som är behållare.
        </p>
        <div className="card card-interactive" style={{ marginTop: '1rem' }}>
          <div className="card-avatar" />
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <p className="card-text">Gillar brädspel, klättring och katter.</p>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Profilkort (.card .card-wide), för att visa en hel profil, egen eller någon annans
        </p>
        <p className="hint-text">
          Inte klickbart, därför en blå hård skugga hela tiden. Klickbara kort har ingen skugga
          i vila och får gul kant, gul skugga och lyft vid hover.
        </p>
        <div className="card card-wide" style={{ marginTop: '1rem' }}>
          <div className="card-avatar" />
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <p className="card-text">Gillar brädspel, klättring och katter.</p>
        </div>
      </section>

      <section className="style-section">
        <h2>Brev</h2>
        <p className="swatch-label">Kuvert (.envelopes med ConversationCard)</p>
        <p className="hint-text">
          Fem per rad på dator, från vänster i linje med rubriken och flikarna, och tre i mitten på
          mobil. Klickbara som andra kort (.card-interactive): lyfts och
          får gul kant vid hover. Ett öppnat kuvert öppnar fliken och visar en bit av brevpappret; ett
          nytt (.envelope-new) förblir stängt och har ett gult sigill. Avståndet mellan raderna följer
          kuvertens storlek, så att ett öppnat kuvert aldrig rör kuvertet ovanför. Personens bild står
          bredvid namnet och växer med kuvertet. Över bilden och namnet står "Från" eller "Till", efter vem som
          skrev det senaste brevet.
        </p>
        <ul className="envelopes" style={{ marginTop: '1rem' }}>
          {EXAMPLE_CONVERSATIONS.map(({ isNew, ...conversation }) => (
            <li key={conversation.id}>
              <ConversationCard conversation={conversation} isNew={isNew} />
            </li>
          ))}
        </ul>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Anteckningspapper (.notepad .lined-paper), för en konversation
        </p>
        <p className="hint-text">
          Linjerat papper med röd marginal. Allt på pappret har radhöjden --line-gap, så att texten
          står på linjerna. Profilbilden (Avatar) står överst och vid varje brev, och ryms inom raden. Någon annans bild och namn (överst och vid breven, ChatSender) är länkar till profilen. .lined-paper är samma papper som i kuvertet. På mobil ligger pappret längst
          ner på skärmen. Meddelandena scrollar i sin ruta, högst 15 linjer (useChatScroll). Samma papper används i klubbens chatt (GroupChat), bredvid klubben på dator och under på mobil: rubriken Klubbchatt, medlemmarnas bilder
          och namn vid varje meddelande, och en svarsrad. Meddelanden i följd från samma person, inom 5
          minuter, står under samma namn och bild (startsGroup i utils/messageGroups.js). Klubbens anslagstavla (GroupPosts, .board) ligger
          överst på klubbsidan för medlemmar: en låg korktavla med handritade lappar (.paper-note, samma som
          kartans lappar). En lapp visar tre rader; ett klick öppnar hela lappen i en popup, där den som
          satte upp den och ägaren kan ta ner den. Ägaren kan nåla fast en lapp i taget (.is-pinned: rak,
          svagt gul och med en röd knappnål), som alltid ligger först och bara ägaren kan ta ner.
          Medlemmarna (.group-members) står i två kolumner.
        </p>
        <article className="notepad lined-paper" style={{ marginTop: '1rem' }}>
          <h3 className="notepad-title">
            <span className="notepad-title-link">
              <Avatar name="Bob" className="person-list-avatar notepad-title-avatar" />
              <span className="notepad-title-name">Bob</span>
            </span>
          </h3>
          <ol className="notepad-messages">
            <li className="notepad-message">
              <p className="notepad-message-head">
                <ChatSender userId={2} name="Bob" /> <time className="hint-text">igår 12:05</time>
              </p>
              <p>Ska vi klättra på lördag?</p>
            </li>
            {/* Samma person inom 5 minuter: under samma namn (.notepad-message-continued). */}
            <li className="notepad-message notepad-message-continued">
              <p title="igår 12:06">Vi kan ses vid hallen kl 10.</p>
            </li>
            <li className="notepad-message">
              <p className="notepad-message-head">
                <ChatSender mine name="Emmy" /> <time className="hint-text">11:35</time>
              </p>
              <p>Ja gärna!</p>
            </li>
          </ol>
          <form className="notepad-reply" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="example-reply" className="visually-hidden">
              Skriv till Bob
            </label>
            <input id="example-reply" type="text" placeholder="Skriv till Bob..." />
            <button type="submit" className="primary-button button-small">
              Skicka
            </button>
          </form>
        </article>
      </section>

      <section className="style-section">
        <h2>Notiser</h2>
        <p className="swatch-label">Klocklappen på kartan (Notiser, notiser.svg)</p>
        <p className="hint-text">
          Lappen ligger sist bland sidornas lappar på kartan (MapPageWidgets) och har samma röda siffra som de andra
          (.map-widget-badge i map.css): antalet olästa notiser. Den studsar till när siffran går upp.
        </p>
        <div className="swatch-grid" style={{ marginTop: '1rem' }}>
          <div className="swatch">
            <span className="app-nav-link" style={{ padding: 0 }}>
              <img src={notiserIcon} alt="" className="nav-icon" />
              <span className="app-nav-label">Notiser</span>
            </span>
          </div>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Listan (.notification-list med NotificationRow)
        </p>
        <p className="hint-text">
          Som en inkorg: en kompakt rad per notis i en vit ruta, nyaste först. En oläst notis har gul prick, fet
          rubrik och en gul kant till vänster. Långa rubriker kortas med ... på raden. Ett klick öppnar notisen och
          först då räknas den som läst; krysset tar bort den. Ovanför listan står "Markera alla som lästa" (grå och
          utan gul linje när allt redan är läst) och "Ta bort alla", som frågar först i en popup.
        </p>
        <ul className="notification-list" style={{ marginTop: '1rem' }}>
          {EXAMPLE_NOTIFICATIONS.map((n) => (
            <NotificationRow key={n.id} notification={n} onOpen={() => {}} onRemove={() => {}} />
          ))}
        </ul>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          En öppnad notis (NotificationDetails)
        </p>
        <p className="hint-text">
          Ett vitt kort med avsändare och tid, rubriken, texten och ett citat (t.ex. skaparens meddelande när ett
          event ställs in), och "Visa" om notisen har en länk. Långa ord bryts, så att inget sticker ut på mobil.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <NotificationDetails notification={EXAMPLE_NOTIFICATION} onRemove={() => {}} />
        </div>
      </section>

      <section className="style-section">
        <h2>Sidlayout och listor</h2>
        <p className="hint-text">
          Byggstenarna som listsidor (Klubbar, Events) delar. Nya sidor ska återanvända dem och
          inte få egna kopior.
        </p>

        <p className="swatch-label" style={{ marginTop: '1.5rem' }}>
          Rubrikrad (.page-header) med skapa-knapp, och flikar (.filter-tabs)
        </p>
        <p className="hint-text">
          På dator ligger rubrik och flikar till vänster på alla sidor, på mobil centrerade (Brev,
          Personer, Klubbar och Events, också i kartans block). Lägg .app-section-centered på sidans
          .app-section för sidor med kort i rutnät (Klubbar och Events): "+ Skapa"-knappen direkt efter
          rubriken och tätare avstånd. Flikarna är sammanhängande knappar med en ram runt, och den
          valda är gul; på mobil bryts de till flera rader. En tom flik har en knapp vidare. Vald flik sparas i adressen med useTabParam (?flik=kompisar),
          så att Tillbaka kommer tillbaka till samma flik.
        </p>
        <section className="app-section app-section-centered" style={{ padding: 0, marginTop: '1rem' }}>
          <div className="page-header">
            <h1 className="app-title">Exempel</h1>
            <CreateButton label="Skapa" onClick={() => {}} />
          </div>
          <div className="filter-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="true" className="tag tag-selected">Första (2)</button>
            <button type="button" role="tab" aria-selected="false" className="tag">Andra (0)</button>
            <button type="button" role="tab" aria-selected="false" className="tag">Tredje (5)</button>
          </div>
        </section>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Filter (.filter-select-row, .filter-select-row-compact för smalare)
        </p>
        <div className="filter-select-row filter-select-row-compact" style={{ marginTop: '1rem' }}>
          <select aria-label="Exempel 1"><option>Alla intressen</option></select>
          <MunicipalityPicker
            aria-label="Exempel 2"
            municipalities={EXAMPLE_MUNICIPALITIES}
            value={filterMunicipality}
            onChange={setFilterMunicipality}
            emptyLabel="Alla kommuner"
          />
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Listkort (.list-card) i ett rutnät (.card-grid .card-grid-compact)
        </p>
        <p className="hint-text">
          Hela övre delen (.list-card-link) är klickbar. Knappar och märken ligger utanför den, i
          .card-actions. Korten i .card-grid-compact är lika höga i varje rad, och på dator fyller de
          bredden kant i kant med rubriken, så många per rad som får plats. Klubb- och eventkort är
          minst --card-height höga; namnet kortas av efter två rader och beskrivningen efter tre, med
          "…". Ort och medlemmar (en rad) eller tid och plats (två rader) ligger nederst, ovanför
          intresset (.list-card-meta), så att de och taggen står på samma plats på alla kort; varje rad
          kortas med "…". Personkorten är så höga som innehållet och visar högst tre intressen på en rad (så
          många som får plats hela); fler fälls ut i en ruta med ⋯.
        </p>
        <div className="card-grid card-grid-compact" style={{ marginTop: '1rem' }}>
          <article className="card card-interactive list-card">
            <button type="button" className="list-card-link">
              <span className="card-title">Exempel</span>
              <span className="card-subheading list-card-meta">Göteborg · 3 medlemmar</span>
              <span className="card-text list-card-description">
                En kort beskrivning som visas på kortet. Är den lång kortas den av efter tre rader.
              </span>
            </button>
            <div className="card-actions">
              <span className="status-pill status-pill-success">Medlem</span>
              <span className="status-pill">Privat</span>
            </div>
          </article>
          <article className="card card-interactive list-card">
            <button type="button" className="list-card-link">
              <span className="card-title">Ett event med ett namn som är så långt att det kortas av</span>
              <span className="card-subheading list-card-meta">
                <span>lör 10 okt 13:30 – 16:00</span>
                <span>Slottsskogen, vid stora dammen nedanför Björngårdsvillan</span>
              </span>
              <span className="card-text list-card-description">Tiden på en rad och platsen under.</span>
            </button>
            <div className="card-actions">
              <span className="status-pill status-pill-success">Öppet</span>
            </div>
          </article>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Grupper i en lista (.match-group, .match-group-title) och "Ångra" (.undo-notice)
        </p>
        <p className="hint-text">
          Förslag på Personer: de man har intressen gemensamt med står under "Personer med liknande
          intressen", i grupper efter antal gemensamma intressen, med antalet som rubrik ovanför
          korten. Har man tagit bort någon står antalet och "Visa dem igen" under filtren. Direkt efter
          att man tagit bort någon visas .undo-notice med "Ångra" en stund, längst ner i blocket även
          när man scrollar.
        </p>
        <section className="match-group" style={{ marginTop: '1rem' }}>
          <h3 className="match-group-title">
            <strong className="shared-count">3</strong> gemensamma intressen
          </h3>
        </section>
        <p className="undo-notice" style={{ position: 'static' }}>
          Bob är borttagen från förslagen.{' '}
          <button type="button" className="text-button">
            Ångra
          </button>
        </p>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Statusmärken (.status-pill, med .status-pill-success, .status-pill-error eller .status-pill-owner)
        </p>
        <div className="card-actions" style={{ marginTop: '1rem' }}>
          <span className="status-pill">Vanlig</span>
          <span className="status-pill status-pill-success">Success</span>
          <span className="status-pill status-pill-error">Error</span>
          <span className="status-pill status-pill-owner">Ägare</span>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Ark (.card .sheet) för en posts egen vy (.detail-view) eller ett formulär (.auth-form .form-wide)
        </p>
        <p className="swatch-label" style={{ marginTop: '1rem' }}>
          "← Tillbaka" (BackButton) ligger ovanför rutan, inte inuti den
        </p>
        <div style={{ marginTop: '0.5rem' }}>
          <BackButton onClick={() => {}} />
        </div>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <section className="detail-view">
            <p className="card-title">Exempel</p>
            <p className="card-subheading">Göteborg · 3 medlemmar</p>
            <p className="card-text">Hela beskrivningen visas här.</p>
            <div className="card-actions">
              <button type="button" className="primary-button">Gå med</button>
            </div>
            <div className="detail-view-section">
              <p className="card-subheading">Ett avsnitt (.detail-view-section)</p>
              <p className="hint-text">Med en rad luft ovanför, för att skilja det från texten ovanför.</p>
            </div>
          </section>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Titelrad (.title-row): titel till vänster och ett märke i högerkanten
        </p>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <section className="detail-view">
            <div className="title-row">
              <p className="card-title">Exempel</p>
              <span className="status-pill">Öppet</span>
            </div>
            <p className="card-subheading">lör 10 okt. 13:30 · Slottsskogen</p>
          </section>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Personlista (.person-list, .person-list-item, .person-list-avatar)
        </p>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <div className="person-list">
            <p className="card-subheading">Medlemmar</p>
            <ul>
              <li>
                <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                  <Avatar name="E" className="person-list-avatar" />
                  <span>Emmy</span>
                  <span className="hint-text">Ägare</span>
                </a>
              </li>
              <li>
                <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                  <Avatar name="L" className="person-list-avatar" />
                  <span>Leonard</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Kompakt personlista (.person-list .person-list-compact)
        </p>
        <p className="hint-text">
          Liten text och små avatarer, för när många personer ska rymmas, t.ex. vilka som har
          svarat på ett event. Rubrikerna ovanför grupperna är .hint-text.
        </p>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <div className="person-list person-list-compact">
            <div>
              <p className="hint-text">Ja (2)</p>
              <ul>
                <li>
                  <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                    <Avatar name="E" className="person-list-avatar" />
                    <span>Emmy</span>
                  </a>
                </li>
                <li>
                  <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                    <Avatar name="F" className="person-list-avatar" />
                    <span>Filip</span>
                    <span className="status-pill">Blockerad</span>
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="hint-text">Kanske (1)</p>
              <ul>
                <li>
                  <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                    <Avatar name="L" className="person-list-avatar" />
                    <span>Leonard</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Lista med länkar, gul penna vid hover och tangentbordsfokus (.person-list .person-list-compact .person-list-marker)
        </p>
        <p className="hint-text">
          Samma lista utan avatarer. Titeln får den gula överstrykningspennan (som .highlight) när
          man pekar på raden eller tabbar dit, i stället för understrykning. Tid och plats ligger i .hint-text.
          Används t.ex. för klubbens kommande events.
        </p>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <div className="person-list person-list-compact person-list-marker">
            <p className="card-subheading">Kommande events</p>
            <ul>
              <li>
                <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                  <span>Fota katter</span>
                  <span className="hint-text">lör 10 okt 13:30 · I plugget</span>
                </a>
              </li>
              <li>
                <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                  <span>Stenjakt</span>
                  <span className="hint-text">sön 11 okt 10:00 · Slottsskogen</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="style-section">
        <h2>Popup</h2>
        <p className="hint-text">
          Modal.jsx, byggd på det inbyggda &lt;dialog&gt;: en vit ruta (.card .modal) med rubrik och
          "Stäng" över en mörk bakgrund. Esc och ett klick på bakgrunden stänger den. En lång lista
          läggs i .modal-scroll så att den rullar, och en rad med kryssruta är en
          label.person-list-item. Används t.ex. för "Bjud in" på ett event.
        </p>
        <p className="hint-text">
          "Anmäl" (ReportButton) öppnar en popup med det som anmäls (.report-quote), anledningarna som
          radioknappar (.report-reasons) och en valfri kommentar, och sedan en bekräftelse med "Blockera …
          också". Knappen finns på profiler, i popupen för en lapp och vid andras brev och
          chattmeddelanden, där den är en liten grå länk till höger (.report-link) som syns vid hovring
          på dator och alltid på mobil.
        </p>
        <p className="hint-text">
          Moderering (ModerationPage, bara för moderatorer) visar anmälningarna som kort (.moderation-card)
          med anledningen som .status-pill-error och texten som .report-quote. Rutan "Stäng av …" har en
          gul påminnelse (.moderation-reminder) om personen har varit avstängd förut, och nästa steg är förvalt.
        </p>
        <button type="button" className="secondary-button button-small" style={{ marginTop: '1rem' }} onClick={() => setModalOpen(true)}>
          Öppna exempel
        </button>
        {modalOpen && (
          <Modal title="Exempel" onClose={() => setModalOpen(false)}>
            <div className="modal-scroll">
              <div className="person-list person-list-compact">
                <ul>
                  <li>
                    <label className="person-list-item">
                      <input type="checkbox" />
                      <Avatar name="E" className="person-list-avatar" />
                      <span>Emmy</span>
                    </label>
                  </li>
                  <li>
                    <label className="person-list-item">
                      <input type="checkbox" defaultChecked />
                      <Avatar name="L" className="person-list-avatar" />
                      <span>Leonard</span>
                    </label>
                  </li>
                </ul>
              </div>
            </div>
            <div className="card-actions">
              <button type="button" className="secondary-button button-small" onClick={() => setModalOpen(false)}>
                Avbryt
              </button>
              <button type="button" className="primary-button button-small" onClick={() => setModalOpen(false)}>
                Klar
              </button>
            </div>
          </Modal>
        )}
      </section>

      <section className="style-section">
        <h2>Blek ruta (Om mig)</h2>
        <p className="hint-text">
          Ett eget fält (.soft-box): blekgult (--color-accent-soft) utan kant, samma rundning
          som formulärfälten. Smal som standard, så den passar inne i ett profilkort. Som "Om
          mig" bevarar den radbrytningar (.soft-box-text) och visas bara om texten finns.
          Med .soft-box-wide fyller den hela bredden i ett ark, t.ex. "Kommer du?" på ett event.
          Samma fält bekräftar att man har gått med i en klubb ("Du är med i …!", .join-notice).
        </p>
        <div className="card card-wide content-stack" style={{ marginTop: '1rem' }}>
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <ProfileAbout text={'Hej! Jag gillar brädspel och klättring.\nSöker folk att spela med på söndagar.'} />
        </div>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <section className="soft-box soft-box-wide">
            <h2>Kommer du?</h2>
            <ul className="tags">
              <li><button type="button" className="tag tag-selected">Ja</button></li>
              <li><button type="button" className="tag">Kanske</button></li>
              <li><button type="button" className="tag">Nej</button></li>
            </ul>
          </section>
        </div>
      </section>

      <section className="style-section">
        <h2>Formulärfält</h2>
        <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="style-guide-example">Exempel-fält</label>
          <input id="style-guide-example" type="text" placeholder="Skriv något..." />
          <p className="hint-text">Hjälptext under ett fält, t.ex. "Minst 8 tecken".</p>
          <label htmlFor="style-guide-textarea">Flerradigt fält (textarea)</label>
          <TextareaWithCount
            id="style-guide-textarea"
            value={exampleText}
            onChange={(e) => setExampleText(e.target.value)}
            maxLength={800}
            placeholder="Berätta lite om dig själv..."
          />
          <p className="hint-text">Teckenräknaren ligger inne i fältet, nere till höger.</p>
          <label htmlFor="style-guide-birth-date">Födelsedatum (BirthDatePicker)</label>
          <BirthDatePicker id="style-guide-birth-date" value={exampleBirthDate} onChange={setExampleBirthDate} />
          <p className="hint-text">
            Dag, månad och år i tre listor. Värdet är ÅÅÅÅ-MM-DD när alla tre är valda
            {exampleBirthDate ? ` (nu ${exampleBirthDate})` : ''}. Dagarna följer månaden, och datum i framtiden
            går inte att välja.
          </p>
          <label htmlFor="style-guide-municipality">Sökbart kommunfält (MunicipalityPicker)</label>
          <MunicipalityPicker
            id="style-guide-municipality"
            municipalities={EXAMPLE_MUNICIPALITIES}
            value={exampleMunicipality}
            onChange={setExampleMunicipality}
          />
          <p className="hint-text">
            Skriv för att söka (å, ä och ö spelar ingen roll), välj med pilarna och Enter. Bara kommuner i
            listan kan väljas. Med emptyLabel kan man välja "ingen", som i filtret ovan.
          </p>
          <button type="submit">Skicka</button>
        </form>
        <p className="status-success" style={{ marginTop: '1rem' }}>Sparat!</p>
        <p className="status-error">Något gick fel, försök igen.</p>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Kompakt formulär (.auth-form .form-wide .form-compact) för att skapa en post, t.ex. event
          och klubb
        </p>
        <p className="hint-text">
          .form-wide betyder bara full bredd, och .form-compact ger mindre fält, text och knappar
          än det vanliga formuläret (så ett bredformulär kan ha vanliga fält). Varje fält ligger i en
          .form-field (etiketten tätt ovanför), flera bredvid varandra i en .form-row (de lägger
          sig under varandra när det är trångt), och knapparna sida vid sida i .form-actions.
          Titel och beskrivning kan få större fält med .field-large.
        </p>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <form className="auth-form form-wide form-compact" onSubmit={(e) => e.preventDefault()}>
            <h2>Skapa något</h2>
            <FormField id="compact-title" label="Titel (.field-large)">
              <input id="compact-title" className="field-large" type="text" />
            </FormField>
            <FormField id="compact-text" label="Beskrivning">
              <TextareaWithCount
                id="compact-text"
                value={compactText}
                onChange={(e) => setCompactText(e.target.value)}
                maxLength={800}
                rows={3}
              />
            </FormField>
            <div className="form-row">
              <FormField id="compact-start" label="Start">
                <input id="compact-start" type="datetime-local" />
              </FormField>
              <FormField id="compact-end" label="Slut (valfritt)">
                <input id="compact-end" type="datetime-local" />
              </FormField>
            </div>
            <FormField id="compact-place" label="Plats">
              <input id="compact-place" type="text" placeholder="T.ex. Slottsskogen" />
            </FormField>
            <div className="form-actions">
              <button type="submit">Skapa</button>
              <button type="button" className="button-secondary">Avbryt</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

export default StyleGuide
