// Utseendet vi har valt i testpanelen, som gäller för alla. Varje val blir ett data-attribut på <html> (se
// useDesignChoice). I testläget är det här förvalet i testpanelen, som fortfarande kan byta (se PadBackgroundPicker).
// Väljare som inte står här använder 'pre-dev'. Stilarna bor kvar i devtools tills de andra utseendena städas bort.
import '../styles/padBackgrounds.css'
import '../styles/uiStyles.css'

export const CHOSEN_DESIGN = {
  // Blocket och flikarna
  padHead: 'ny',
  padBg: 'akvarell',
  uiStyle: 'handskrivet',
  // Klubbar
  clubCard: '7',
  searchStyle: 'mjuk',
  visStyle: 'mjuk',
  // Events (biljetten är inget val längre, utan alltid utseendet, se EventList)
  eventCalendar: 'kalender',
  // Kartan (se map/themes.js)
  mapGround: 'kaffe',
  mapLines: 'stora-rutor',
  mapGlow: 'ingen',
  mapRoads: 'hela',
  mapWater: 'ljus',
  mapWaterStyle: 'hel',
  mapForest: 'mork',
  mapForestStyle: 'stark',
  mapHouseColors: 'varma',
  mapHouseStyle: 'farg-tak',
}

export function applyChosenDesign() {
  Object.assign(document.documentElement.dataset, CHOSEN_DESIGN)
}
