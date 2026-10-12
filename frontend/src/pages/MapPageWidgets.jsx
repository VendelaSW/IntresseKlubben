import brevIcon from '../assets/brev.png'
import eventIcon from '../assets/event.png'
import klubbarIcon from '../assets/klubbar.png'
import personerIcon from '../assets/personer.png'

// Appens sidor som små lappar bredvid profillappen (på mobil som en rad
// längst ned), med samma ikoner som appens meny. Ett klick lägger sidan som
// ett block på kartan (se MapPagePad); klickar man på den öppna sidans lapp
// igen stängs blocket.
const WIDGETS = [
  { id: 'brev', label: 'Brev', icon: brevIcon },
  { id: 'personer', label: 'Personer', icon: personerIcon },
  { id: 'klubbar', label: 'Klubbar', icon: klubbarIcon },
  { id: 'events', label: 'Events', icon: eventIcon },
]

function MapPageWidgets({ openPage, onOpen }) {
  return (
    <nav className="map-page-widgets" aria-label="Sidor">
      {WIDGETS.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          className={`map-page-widget${openPage === id ? ' is-open' : ''}`}
          aria-pressed={openPage === id}
          title={label}
          onClick={() => onOpen(openPage === id ? null : id)}
        >
          <img src={icon} alt="" className="map-page-widget-icon" />
          <span className="map-page-widget-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}

export default MapPageWidgets
