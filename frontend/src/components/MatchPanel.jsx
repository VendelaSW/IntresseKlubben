import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import kompisMedGlasogon from '../assets/kompis-glasogon.webp'
import { sendContactRequest } from '../services/contacts'
import { getMatches } from '../services/matches'
import { dismissSuggestion, undoDismissSuggestion } from '../services/people'
import DrawnArrow from './DrawnArrow'
import EmptyState from './EmptyState'
import LoadError from './LoadError'
import MatchCard from './MatchCard'
import MatchUpNext from './MatchUpNext'

// Så länge beskedet ("Ångra") syns efter att man skickat eller tagit bort någon.
const NOTICE_MS = 8000

// När så få förslag finns kvar hämtas nästa sida i förväg, så att Näst på tur aldrig tar slut mitt i.
const PREFETCH_AT = 5

// Under så här många pixlar kvar i blocket får fliken scrolla som vanligt, i stället för att kortet trycks ihop.
const MIN_ROOM = 320

// Avståndet från elementets överkant till `ancestor`s, i layouten (offset-mått: blocken på kartan lutar lite, och då stämmer
// inte getBoundingClientRect). Ligger `ancestor` inte i kedjan av offsetParent räknas båda från sidans överkant.
function offsetTopIn(element, ancestor) {
  let top = 0
  for (let e = element; e; e = e.offsetParent) {
    if (e === ancestor) return top
    top += e.offsetTop
  }
  for (let e = ancestor; e; e = e.offsetParent) top -= e.offsetTop
  return top
}

// Om mig-texten på kortet kortas med "…" så att kortet håller sig inom sin höjd utan scroll: först högst 8 rader (se
// .poster-about-clamped), och sticker kortet ändå ut så många rader färre som behövs, men minst två. Utan scroll-läget
// (.is-fitted) gäller bara de 8 raderna. Mätt med offset-mått, som i offsetTopIn.
const MIN_ABOUT_LINES = 2

function fitAboutText(panel) {
  const card = panel?.querySelector('.match-card')
  const about = card?.querySelector('.poster-about')
  if (!about) return
  about.style.removeProperty('--about-lines')
  if (!panel.classList.contains('is-fitted')) return
  const overflow = () => {
    const last = card.lastElementChild
    return last.offsetTop + last.offsetHeight - (card.clientHeight - (parseFloat(getComputedStyle(card).paddingBottom) || 0))
  }
  const tooMuch = overflow()
  if (tooMuch <= 0) return
  const lineHeight = parseFloat(getComputedStyle(about).lineHeight) || 20
  const lines = Math.max(MIN_ABOUT_LINES, Math.floor((about.clientHeight - tooMuch) / lineHeight))
  about.style.setProperty('--about-lines', String(lines))
}

// Matcha-fliken ska inte scrolla: panelen får höjden som är kvar i blocket (.map-pad-page) under filtren, och CSS:en
// (.match-panel.is-fitted) får kortet att hålla sig inom den. Mäts om när blocket eller innehållet ovanför ändrar storlek,
// t.ex. när filtren öppnas eller fönstret ändras.
function useFitToPad(panelRef) {
  useLayoutEffect(() => {
    const panel = panelRef.current
    const pad = panel?.closest('.map-pad-page')
    if (!pad) return undefined
    const measure = () => {
      const padBottom = parseFloat(getComputedStyle(pad).paddingBottom) || 0
      const room = Math.floor(pad.clientHeight - padBottom - offsetTopIn(panel, pad))
      const fits = room >= MIN_ROOM
      panel.classList.toggle('is-fitted', fits)
      if (fits) panel.style.setProperty('--match-room', `${room}px`)
      else panel.style.removeProperty('--match-room')
      fitAboutText(panel)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pad)
    if (panel.parentElement) observer.observe(panel.parentElement)
    // Typsnitten kan komma efter första mätningen, och då ändras radernas höjd.
    document.fonts?.ready.then(measure)
    return () => observer.disconnect()
  }, [panelRef])
}

// Matcha-fliken under Medlemmar: det bästa förslaget som ett stort kort överst och de närmast på tur som små avatarer under
// (MatchUpNext, så att det syns att det finns fler), bäst först (GET /matches). Skickar eller tar man bort någon växer nästa kort fram. På kortet kan man skicka en
// kompisförfrågan eller ta bort förslaget för gott (med Ångra). Med pilarna vid kortets sidor går man vidare till nästa (utan
// att ta bort något, personen kan dyka upp igen nästa gång fliken öppnas) eller tillbaka till den man nyss gick förbi.
//
// Förslagen hämtas tio åt gången, och nästa sida hämtas i förväg när det bara finns några kvar. Skickar eller tar man bort
// någon försvinner hen ur listan, medan de man gått vidare förbi blir kvar överst. Nästa sida hämtas därför med offset =
// så många man har gått vidare förbi plus de som ännu inte har visats (inte hur många man har sett), annars hoppas någon över. Kommuner, kön och ålder är samma filter som i Sök, och när ett
// av dem ändras börjar listan om från första kortet. `onChanged` anropas när något har ändrats som andra flikar visar
// (en skickad förfrågan). `myInterestIds` (en Set) markerar gemensamma intressen på kortet.
function MatchPanel({ municipalityCodes, genders, minAge, maxAge, myInterestIds, onChanged }) {
  // phase: loading, ready (items[0] är kortet som visas), done (inga fler), not_ready (för lite i min profil) eller error.
  const [state, setState] = useState({ phase: 'loading', items: [], hasMore: false, missing: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null) // { text, undo? }
  const [history, setHistory] = useState([]) // de man gått förbi med pilen, den senaste sist: pilen åt vänster tar tillbaka den
  const panelRef = useRef(null)
  useFitToPad(panelRef)
  const skipped = useRef(0)
  const request = useRef(0)
  const appending = useRef(false)

  // Hämtar en sida. Ett svar på en äldre hämtning (filtret har ändrats sedan dess) kastas.
  const load = useCallback(
    async (offset) => {
      const mine = ++request.current
      setState((s) => ({ ...s, phase: 'loading' }))
      try {
        const page = await getMatches({ offset, municipalityCodes, genders, minAge, maxAge })
        if (mine !== request.current) return
        if (page.status === 'not_ready') {
          setState({
            phase: 'not_ready',
            items: [],
            hasMore: false,
            missing: { interests: page.missing_interests, chars: page.missing_chars },
          })
        } else {
          setState({ phase: 'ready', items: page.matches, hasMore: page.has_more, missing: null })
        }
      } catch {
        if (mine === request.current) setState((s) => ({ ...s, phase: 'error' }))
      }
    },
    [municipalityCodes, genders, minAge, maxAge],
  )

  // Första sidan, och om från början när ett filter ändras.
  useEffect(() => {
    skipped.current = 0
    setHistory([])
    load(0)
  }, [load])

  // Slut på sidan: hämta nästa, eller visa att det inte finns fler.
  useEffect(() => {
    if (state.phase !== 'ready' || state.items.length > 0) return
    if (state.hasMore) load(skipped.current)
    else setState((s) => ({ ...s, phase: 'done' }))
  }, [state, load])

  // Förhämtning: nästa sida läggs på slutet medan det ännu finns några kort kvar, så att de små korten aldrig tar slut mitt i.
  // Ett svar efter att filtret ändrats (eller en Ångra) kastas, som i load.
  useEffect(() => {
    if (state.phase !== 'ready' || !state.hasMore || state.items.length === 0 || state.items.length >= PREFETCH_AT) return
    if (appending.current) return
    appending.current = true
    const mine = request.current
    getMatches({ offset: skipped.current + state.items.length, municipalityCodes, genders, minAge, maxAge })
      .then((page) => {
        if (mine !== request.current || page.status !== 'ok') return
        setState((s) => {
          const have = new Set(s.items.map((item) => item.id))
          return { ...s, items: [...s.items, ...page.matches.filter((item) => !have.has(item.id))], hasMore: page.has_more }
        })
      })
      .catch(() => {})
      .finally(() => {
        appending.current = false
      })
  }, [state, municipalityCodes, genders, minAge, maxAge])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  function advance() {
    setState((s) => ({ ...s, items: s.items.slice(1) }))
  }

  async function act(action) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const current = state.phase === 'ready' ? state.items[0] : null
  // Ett nytt kort: Om mig kortas om efter den nya texten.
  useLayoutEffect(() => fitAboutText(panelRef.current), [current])
  const nameOf = (match) => match.name ?? match.username

  function handleSend(match) {
    act(async () => {
      await sendContactRequest(match.id)
      setNotice({ text: `Kompisförfrågan skickad till ${nameOf(match)}.` })
      onChanged?.()
      advance()
    })
  }

  function handleSkip() {
    skipped.current += 1
    setHistory((h) => [...h, current])
    advance()
  }

  // Tillbaka till den man gick förbi senast: den blir kortet som visas, och antalet förbigångna blir ett färre.
  function handleBack() {
    const previous = history.at(-1)
    if (!previous) return
    skipped.current -= 1
    request.current += 1 // ett pågående anrop efter fler förslag kastas
    setHistory((h) => h.slice(0, -1))
    setState((s) => ({ ...s, phase: 'ready', items: [previous, ...s.items] }))
  }

  function handleDismiss(match) {
    act(async () => {
      await dismissSuggestion(match.id)
      setNotice({ text: `${nameOf(match)} är borttagen från förslagen.`, undo: () => handleUndo(match) })
      advance()
    })
  }

  // Personen kommer tillbaka som nästa kort (och ett pågående anrop efter fler förslag kastas).
  function handleUndo(match) {
    setNotice(null)
    act(async () => {
      await undoDismissSuggestion(match.id)
      request.current += 1
      setState((s) => ({ ...s, phase: 'ready', items: [match, ...s.items] }))
    })
  }

  function restart() {
    skipped.current = 0
    setHistory([])
    setNotice(null)
    load(0)
  }

  const noticeElement = notice && (
    <p className="undo-notice" role="status">
      {notice.text}
      {notice.undo && (
        <>
          {' '}
          <button type="button" className="text-button" disabled={busy} onClick={notice.undo}>
            Ångra
          </button>
        </>
      )}
    </p>
  )

  let body
  if (state.phase === 'loading') {
    body = <p className="hint-text">Laddar...</p>
  } else if (state.phase === 'error') {
    body = <LoadError text="Kunde inte hämta förslagen." onRetry={() => load(skipped.current)} />
  } else if (state.phase === 'not_ready') {
    const { interests, chars } = state.missing
    const needs = [
      interests > 0 && `${interests} ${interests === 1 ? 'intresse' : 'intressen'} till`,
      chars > 0 && `${chars} tecken till i din presentation`,
    ].filter(Boolean)
    body = (
      <EmptyState
        image={kompisMedGlasogon}
        title="Lite mer behövs"
        text={`För att kunna föreslå någon behöver din profil ${needs.join(' och ')}.`}
      >
        <Link to="/profil" className="secondary-button">
          Till din profil
        </Link>
      </EmptyState>
    )
  } else if (state.phase === 'done') {
    const seenSome = skipped.current > 0
    body = (
      <EmptyState
        image={kompisMedGlasogon}
        title={seenSome ? 'Det var alla förslag' : 'Inga förslag just nu'}
        text={
          seenSome
            ? 'Du har sett alla förslag just nu. Du kan börja om från början, eller titta under Sök.'
            : 'Just nu finns det ingen att föreslå. Lägg till fler intressen eller skriv mer om dig själv, så hittar vi fler. Du kan också titta under Sök.'
        }
      >
        {seenSome && (
          <button type="button" className="secondary-button" onClick={restart}>
            Börja om från början
          </button>
        )}
      </EmptyState>
    )
  } else if (!current) {
    body = <p className="hint-text">Laddar...</p>
  } else {
    const sharedProps = { sharedInterestIds: myInterestIds }

    body = (
      <div className="match-stack">
        <div className="match-stage">
          <button
            type="button"
            className={`match-arrow${history.length === 0 ? ' is-hidden' : ''}`}
            aria-label="Förra förslaget"
            disabled={busy || history.length === 0}
            onClick={handleBack}
          >
            <DrawnArrow className="match-arrow-prev" />
          </button>
          <MatchCard
            key={current.id}
            match={current}
            {...sharedProps}
            busy={busy}
            onSend={() => handleSend(current)}
            onDismiss={() => handleDismiss(current)}
          />
          <button type="button" className="match-arrow" aria-label="Nästa förslag" disabled={busy} onClick={handleSkip}>
            <DrawnArrow className="match-arrow-next" />
          </button>
        </div>
        <MatchUpNext matches={state.items.slice(1)} hasMore={state.hasMore} />
      </div>
    )
  }

  // "Ångra" efter att man skickat eller tagit bort någon.
  return (
    <div ref={panelRef} className="match-panel">
      {body}
      {error && <p className="status-error">{error}</p>}
      {noticeElement}
    </div>
  )
}

export default MatchPanel
