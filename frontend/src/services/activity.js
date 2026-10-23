// Om användaren gör något i appen just nu. Det som hämtas om och om igen
// (märkena, brevtråden, klubbchatten) frågar inte servern när ingen har rört
// appen på IDLE_MS, så att databasen (Neon) kan somna. Den somnar efter några
// minuter utan anrop, och varje minut den är vaken kostar. Utan det här håller
// en flik som bara står öppen databasen vaken dygnet runt.
//
// Så fort man gör något igen (rör musen, skriver, scrollar, trycker, kommer
// tillbaka till fliken) säger modulen till (onUserActive), och det som pausats
// hämtar direkt.

const IDLE_MS = 3 * 60 * 1000

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']

let lastActive = Date.now()
// Sätts när någon har frågat (isIdle) och fått svaret ja, så att de som
// pausade får veta när man är tillbaka.
let idle = false
const listeners = new Set()

function markActive() {
  lastActive = Date.now()
  if (!idle) return
  idle = false
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  for (const name of ACTIVITY_EVENTS) {
    window.addEventListener(name, markActive, { capture: true, passive: true })
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) markActive()
  })
}

// Sant om ingen har rört appen på IDLE_MS.
export function isIdle() {
  if (!idle && Date.now() - lastActive > IDLE_MS) idle = true
  return idle
}

// Anropar `listener` när man gör något igen efter att ha varit inaktiv. Ger en
// funktion som slutar lyssna.
export function onUserActive(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
