import { Suspense, lazy } from 'react'
import { useLocationPicker } from '../hooks/useLocationPicker'
import InfoTip from './InfoTip'
import LocationSearch from './LocationSearch'

// Kartbiblioteket är stort, så kartan laddas först när formuläret visas.
const LocationPickerMap = lazy(() => import('./LocationPickerMap'))

// Var på kartan något är, för events och klubbarnas träffplats: sök fram
// adressen och välj en träff, så hamnar en nål där. Nålen går sedan att dra,
// eller flyttas med ett klick på kartan, så att den står exakt rätt även när
// adressen är vag ("Badplatsen vid sjön"). Sökningen och nålen sköts av
// useLocationPicker (där står vad `queries`, `value`, `onChange` och
// `onAddressFound` är).
//
// `saveLabel` är formulärets knapp ("Skapa klubb"), så att det framgår när nålen
// sparas (i i-ikonen vid rubriken). `kommunCode` är kommunen kartan visar innan
// det finns en nål. Utan nål visas eventet eller klubben mitt i sin kommun på
// kartan.
//
// Sökknappen och knappen som tar bort nålen ligger här bredvid rubriken. Ska de
// ligga någon annanstans (t.ex. bredvid adressfältet), använd useLocationPicker med
// LocationSearch och LocationMap var för sig.
function LocationPicker({ id, queries, value, onChange, saveLabel, kommunCode, onAddressFound }) {
  const picker = useLocationPicker({ queries, value, onChange, onAddressFound })
  return (
    <LocationMap id={id} picker={picker} saveLabel={saveLabel} kommunCode={kommunCode}>
      <LocationSearch picker={picker} />
    </LocationMap>
  )
}

// Rubriken "Var på kartan?" och kartan med nålen. `picker` kommer från
// useLocationPicker, och `children` (t.ex. sökknapparna) står efter rubriken.
export function LocationMap({ id, picker, saveLabel, kommunCode, children }) {
  return (
    <div className="location-picker" role="group" aria-labelledby={`${id}-label`}>
      <div className="location-picker-actions">
        <span className="with-info-tip">
          <span id={`${id}-label`} className="location-picker-label">
            Var på kartan?
          </span>
          <InfoTip
            text={
              picker.value
                ? `Nålen är satt och sparas när du trycker "${saveLabel}". Dra den, eller klicka på kartan, om den inte står helt rätt.`
                : 'Klicka på kartan, eller sök fram adressen. Utan nål visas den mitt i kommunen.'
            }
          />
        </span>
        {children}
      </div>

      <Suspense fallback={<div className="location-picker-map" aria-hidden="true" />}>
        <LocationPickerMap
          value={picker.value}
          onChange={picker.placePin}
          onDrag={picker.followDrag}
          kommunCode={kommunCode}
        />
      </Suspense>
    </div>
  )
}

export default LocationPicker
