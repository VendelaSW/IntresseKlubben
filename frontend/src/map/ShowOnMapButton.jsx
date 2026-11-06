import { createContext, useContext } from 'react'

// Kartans åtgärder för sidor som visas som block på kartan (se MapPagePad):
// { hasLocation(type, id, data), showOnMap(type, id, data) }, där type är
// 'klubb' eller 'event' och data klubben eller eventet från API:t (så att
// platsen kan räknas ut även för något som nyss skapats). Utanför kartan finns
// ingen, och då syns inte knappen nedan.
export const MapActionsContext = createContext(null)

// "Visa på kartan" för en klubb eller ett event, men bara när sidan ligger på
// kartan och klubben/eventet har en plats där. `className` ger utseendet, en liten
// sekundär knapp om inget annat anges (t.ex. "info-link" för en länk).
function ShowOnMapButton({ type, id, data, className = 'secondary-button button-small' }) {
  const map = useContext(MapActionsContext)
  if (!map?.hasLocation(type, id, data)) return null
  return (
    <button type="button" className={className} onClick={() => map.showOnMap(type, id, data)}>
      Visa på kartan
    </button>
  )
}

export default ShowOnMapButton
