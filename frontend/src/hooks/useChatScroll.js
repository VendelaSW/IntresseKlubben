import { useLayoutEffect, useRef } from 'react'

// Hur nära botten (i pixlar) man räknas som "längst ner" i chatten.
const NEAR_BOTTOM = 40

// Scrollen i en chattruta (.notepad-messages har en maxhöjd och en egen
// scrollbar, se index.css). Rutan öppnas längst ner, vid det senaste
// meddelandet, och följer med när nya kommer. Har man scrollat upp för att
// läsa äldre meddelanden får man vara kvar där. Används av brevtråden
// (ConversationPage) och klubbchatten (GroupChat).
//
// `count` är antalet meddelanden. Lägg `listRef` och `onScroll` på listan, och
// anropa `stickToBottom()` när man själv skickar, så att ens eget meddelande
// alltid syns.
export function useChatScroll(count) {
  const listRef = useRef(null)
  const atBottom = useRef(true)

  // Före utritningen, så att rutan aldrig syns i fel läge.
  useLayoutEffect(() => {
    const list = listRef.current
    if (list && atBottom.current) list.scrollTop = list.scrollHeight
  }, [count])

  function onScroll() {
    const list = listRef.current
    atBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM
  }

  function stickToBottom() {
    atBottom.current = true
  }

  return { listRef, onScroll, stickToBottom }
}
