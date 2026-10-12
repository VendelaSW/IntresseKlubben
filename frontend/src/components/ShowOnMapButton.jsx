import { createContext, useContext } from 'react'

// Kartans åtgärder för sidor som visas som block på kartan (karta-prototypen):
// { hasLocation(type, id), showOnMap(type, id) }, där type är 'klubb' eller
// 'event'. Utanför kartan finns ingen, och då syns inte knappen nedan.
export const MapActionsContext = createContext(null)

// "Visa på kartan" för en klubb eller ett event, men bara när sidan ligger på
// kartan och klubben/eventet har en plats där.
function ShowOnMapButton({ type, id }) {
  const map = useContext(MapActionsContext)
  if (!map?.hasLocation(type, id)) return null
  return (
    <button type="button" className="secondary-button button-small" onClick={() => map.showOnMap(type, id)}>
      Visa på kartan
    </button>
  )
}

export default ShowOnMapButton
