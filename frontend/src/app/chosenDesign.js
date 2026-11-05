// Appens utseende. Varje val blir ett data-attribut på <html>, som CSS:en utgår från. Kartans utseende
// finns i map/theme.js.
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
}

export function applyChosenDesign() {
  Object.assign(document.documentElement.dataset, CHOSEN_DESIGN)
}
