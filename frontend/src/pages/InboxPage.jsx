import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ConversationCard from '../components/ConversationCard'
import DrawnArrow from '../components/DrawnArrow'
import EmptyState from '../components/EmptyState'
import LetterFriends from '../components/LetterFriends'
import LoadError from '../components/LoadError'
import { contactsQuery } from '../services/contacts'
import { conversationsQuery } from '../services/messages'
import { shortNames } from '../utils/shortNames'

// Så många kuvert syns åt gången: fyra i bredd och två rader (två i bredd på mobil). Har man färre fylls platserna
// ut med tomma, streckade kuvert, och fler än så scrollar man i sidled med pilarna.
const PAGE_SIZE = 8

// Alla konversationer som kuvert: de man inte har öppnat först och sedan de öppnade, nyast först i båda (SCRUM-319).
// Längst ner kompisar man inte har några brev med än (SCRUM-320), om det finns några.
function InboxPage() {
  // Konversationerna ur det delade minnet (se services/queryClient.js): har man
  // varit här nyss visas listan direkt, och hämtas om i bakgrunden.
  const { data: conversations = [], isSuccess, isError, refetch, isFetching } = useQuery(conversationsQuery)
  const status = isSuccess ? 'ready' : isError ? 'error' : 'loading'
  const { data: contactsData } = useQuery(contactsQuery)

  if (status === 'error') {
    return (
      <div className="content-stack">
        <LoadError text="Kunde inte hämta breven." onRetry={() => refetch()} retrying={isFetching} />
      </div>
    )
  }

  // Listan kommer nyast först från API:t. Oläst räknas på servern (se markConversationRead).
  const ordered = [...conversations.filter((c) => c.unread), ...conversations.filter((c) => !c.unread)]
  // Förnamnen på kuverten, så att två med samma förnamn skiljs åt.
  const names = shortNames(conversations)
  const withLetters = new Set(conversations.map((c) => c.id))
  const friends =
    status === 'ready' ? (contactsData?.contacts ?? []).map((c) => c.user).filter((f) => !withLetters.has(f.id)) : []

  // Sidan är ett <section className="app-section"> rakt av, som Personer,
  // Klubbar och Events, och ligger inte i content-stack (den är byggd för smala
  // sidor och skulle krympa kuverten).
  return (
    <section className="app-section">
      <h1 className="app-title">Brev</h1>

      {status === 'loading' ? (
        <p className="hint-text">Laddar brev...</p>
      ) : conversations.length === 0 ? (
        <EmptyState
          text={
            friends.length > 0
              ? 'Här hamnar brev mellan dig och dina kompisar.'
              : 'Här hamnar brev mellan dig och dina kompisar. Skriv till någon från deras profil under Medlemmar.'
          }
        />
      ) : (
        <EnvelopeRows conversations={ordered} names={names} />
      )}

      {friends.length > 0 && <LetterFriends friends={friends} />}
    </section>
  )
}

// Kuverten i sidor om åtta, fyra i bredd och två rader (två i bredd på mobil), som man bläddrar mellan i sidled med en
// pil åt det håll där det finns fler (samma pil som i Matcha). Får alla plats på en sida fylls de lediga platserna med
// tomma, streckade kuvert.
function EnvelopeRows({ conversations, names }) {
  const pagesRef = useRef(null)
  const [more, setMore] = useState({ left: false, right: false })
  const empty = Math.max(0, PAGE_SIZE - conversations.length)
  const pages = []
  for (let start = 0; start < Math.max(conversations.length, 1); start += PAGE_SIZE) {
    pages.push(conversations.slice(start, start + PAGE_SIZE))
  }

  function update() {
    const scroller = pagesRef.current
    setMore({
      left: scroller.scrollLeft > 1,
      right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
    })
  }

  useEffect(() => {
    update()
    const observer = new ResizeObserver(update)
    observer.observe(pagesRef.current)
    return () => observer.disconnect()
  }, [conversations.length])

  function scroll(direction) {
    const scroller = pagesRef.current
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollBy({ left: direction * scroller.clientWidth, behavior: still ? 'auto' : 'smooth' })
  }

  return (
    <div className="envelope-rows">
      <div className="envelope-rows-scroll">
        <button
          type="button"
          className={`match-arrow${more.left ? '' : ' is-hidden'}`}
          aria-label="Visa tidigare brev"
          onClick={() => scroll(-1)}
        >
          <DrawnArrow className="match-arrow-prev" />
        </button>
        <div ref={pagesRef} className="envelope-pages" onScroll={update}>
          {pages.map((page, index) => (
            <ul key={index} className="envelopes">
              {page.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationCard
                    conversation={conversation}
                    isNew={conversation.unread}
                    shortName={names.get(conversation.id)}
                  />
                </li>
              ))}
              {index === 0 &&
                Array.from({ length: empty }, (_, i) => (
                  <li key={`tomt-${i}`} aria-hidden="true">
                    <span className="envelope-empty" />
                  </li>
                ))}
            </ul>
          ))}
        </div>
        <button
          type="button"
          className={`match-arrow${more.right ? '' : ' is-hidden'}`}
          aria-label="Visa fler brev"
          onClick={() => scroll(1)}
        >
          <DrawnArrow className="match-arrow-next" />
        </button>
      </div>
    </div>
  )
}

export default InboxPage
