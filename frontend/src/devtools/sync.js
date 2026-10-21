import { MESSAGES_READ } from '../services/messages'
import { queryClient } from '../services/queryClient'

// Testpanelen och mobilvyn (appen i en ram, se MobilePreview) är två fönster med var sitt minne. Gör man något i
// panelen säger den till här, så att båda visar det nya.
const CHANNEL = 'intresseklubben-testlage'

// 'refresh': något har hänt (ett scenario), hämta om det som visas.
// 'reload': kontot eller hela testdatan har bytts, ladda om sidan.
export function announce(type) {
  try {
    const channel = new BroadcastChannel(CHANNEL)
    channel.postMessage(type)
    channel.close()
  } catch {
    // Saknas i mycket gamla webbläsare: då uppdateras mobilvyn först när man laddar om den.
  }
}

// Hämtar om listorna och räknar om märkena på kartan (useBadgeCounts räknar om när den här händelsen kommer,
// och den räknar alla märken, inte bara brevens).
export function refreshEverything() {
  queryClient.invalidateQueries()
  window.dispatchEvent(new Event(MESSAGES_READ))
}

// Lyssnar på panelen (i mobilvyns ram). Ger en funktion som slutar lyssna.
export function listen() {
  let channel
  try {
    channel = new BroadcastChannel(CHANNEL)
  } catch {
    return () => {}
  }
  channel.onmessage = ({ data }) => {
    if (data === 'reload') window.location.reload()
    if (data === 'refresh') refreshEverything()
  }
  return () => channel.close()
}
