// Appens utseende. Varje val blir ett data-attribut på <html>, som CSS:en utgår från. Kartans val går att byta i
// testpanelen (se devtools/PadBackgroundPicker.jsx).
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
