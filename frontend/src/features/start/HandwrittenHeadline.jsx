import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

// Huvudrubriken på startsidan (StartPage), skriven för hand: tecknen kommer ett i taget, ord för ord, som när någon
// skriver med penna, och en penna följer med. En rad per sträng i `lines`. Vid radbytet vilar pennan och flyttar
// sig sedan till nästa rad, och sist drar den den gula linjen under rubriken, från vänster till höger.
//
// Tempot är som en människas: tecknen tar lite olika lång tid, och det blir en paus mellan orden och en längre
// efter kommatecken. Rubriken skrivs bara första gången per session (`storageKey` i sessionStorage) och aldrig med
// "minska rörelse" påslaget; då syns den direkt. Ett klick eller en knapptryckning skriver klart den. `always`
// skriver den också med "minska rörelse" (för att kunna titta på den i testläget), men fortfarande bara en gång per
// session. `onDone` anropas när rubriken är klar, också när den visas direkt.
//
// Rubriken finns alltid som vanlig text för skärmläsare (.visually-hidden); tecknen, linjen och pennan är prydnad.

// Hur länge pennan är på väg ned mot pappret innan första tecknet skrivs (se .hw-pen-arrive).
const PEN_IN_MS = 650
// Hur länge pennan är på väg upp och bort när rubriken är klar (se .hw-pen.is-leaving).
const PEN_OUT_MS = 600
// Pausen innan pennan drar linjen under rubriken (den flyttar sig dit under tiden), och hur länge linjen ritas.
const UNDERLINE_PAUSE_MS = 350
const UNDERLINE_MS = 700

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Har rubriken redan skrivits den här sessionen? (StartPage frågar också, för att inte låta polaroiderna falla igen.)
export function alreadyWritten(storageKey) {
  try {
    return sessionStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

function rememberWritten(storageKey) {
  try {
    sessionStorage.setItem(storageKey, '1')
  } catch {
    // Utan sessionStorage (t.ex. ett privat fönster) skrivs rubriken varje gång, och det gör inget.
  }
}

// Ett tal mellan 0 och 1 som alltid blir detsamma för samma tecken, så att rytmen inte ändras mellan renderingar.
function wobble(i) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

// När varje tecken i `text` börjar skrivas (`start`) och hur länge (`dur`), i millisekunder. Ett tecken i taget,
// med en paus mellan orden och efter skiljetecken. Blir det längre än `maxMs` skrivs allt lite snabbare.
function writingSchedule(text, { letterMs = 120, maxMs = 3000 } = {}) {
  let t = 0
  const letters = [...text].map((char, i) => {
    const dur = char === ' ' ? 0 : letterMs * (0.75 + wobble(i) * 0.5)
    const letter = { start: t, dur }
    t += dur
    if (char === ' ') t += letterMs * 1.6
    else if (',;:'.includes(char)) t += 380
    return letter
  })
  const scale = t > maxMs ? maxMs / t : 1
  return {
    letters: letters.map(({ start, dur }) => ({ start: start * scale, dur: dur * scale })),
    total: t * scale,
  }
}

function HandwrittenHeadline({ lines, storageKey, always = false, className = '', onDone }) {
  const boxRef = useRef(null)
  const penRef = useRef(null)
  const underlineRef = useRef(null)
  const [instant] = useState(() => alreadyWritten(storageKey) || (!always && reducedMotion()))
  // 'waiting' (typsnittet laddas), 'writing' eller 'done'.
  const [phase, setPhase] = useState(instant ? 'done' : 'waiting')
  const text = lines.join(' ')
  // Tecknen börjar skrivas när pennan har kommit ned till pappret.
  const schedule = useMemo(() => {
    const { letters, total: written } = writingSchedule(text)
    return { letters: letters.map(({ start, dur }) => ({ start: start + PEN_IN_MS, dur })), total: written + PEN_IN_MS }
  }, [text])
  const total = schedule.total + UNDERLINE_PAUSE_MS + UNDERLINE_MS
  // Pennan syns medan rubriken skrivs, och en stund efteråt medan den lyfts bort (samtidigt som polaroiderna faller).
  // Den visas direkt när skrivandet börjar (inte först när `penShown` har hunnit sättas), så att den finns när
  // effekten nedan börjar flytta den.
  const [penShown, setPenShown] = useState(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Vänta på Caveat, så att pennan följer de riktiga bokstäverna och inte reservtypsnittet.
  useEffect(() => {
    if (phase !== 'waiting') return undefined
    let cancelled = false
    const begin = () => !cancelled && setPhase('writing')
    document.fonts.load('700 100px Caveat').then(begin, begin)
    return () => {
      cancelled = true
    }
  }, [phase])

  // Klart när linjen är dragen, eller direkt vid ett klick eller en knapptryckning.
  useEffect(() => {
    if (phase !== 'writing') return undefined
    const finish = () => setPhase('done')
    const timer = setTimeout(finish, total + 150)
    window.addEventListener('pointerdown', finish)
    window.addEventListener('keydown', finish)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', finish)
      window.removeEventListener('keydown', finish)
    }
  }, [phase, total])

  useEffect(() => {
    if (phase !== 'done') return
    rememberWritten(storageKey)
    onDoneRef.current?.()
  }, [phase, storageKey])

  useEffect(() => {
    if (phase === 'writing') setPenShown(true)
    if (phase !== 'done') return undefined
    // Lite efter att den har tonats bort helt, så att den inte försvinner med ett ryck.
    const timer = setTimeout(() => setPenShown(false), PEN_OUT_MS + 100)
    return () => clearTimeout(timer)
  }, [phase])

  // Pennan följer tecknet som skrivs, från vänster till höger i tecknet. Spetsen sitter längst ned till vänster i
  // pennan (se .hw-pen). Mellan raderna vilar den (slutar vicka, .is-resting) och flyttar sig sedan till nästa rad, och
  // efter sista tecknet flyttar den sig till linjen och drar den.
  useEffect(() => {
    const pen = penRef.current
    const underline = underlineRef.current
    if (phase !== 'writing' || !pen || !underline) return undefined
    const els = [...text].map((_, i) => boxRef.current.querySelector(`[data-i="${i}"]`))
    const lineOf = lines.flatMap((line, l) => [...line, ' '].map(() => l))
    const letters = schedule.letters
    const last = els.findLastIndex(Boolean)
    const length = underline.getTotalLength()
    const t0 = performance.now()
    let frame

    // Tecknets ruta har padding runt tecknet (se .hw-letter). Den räknas bort, så att pennan följer själva tecknet,
    // precis som klippet som visar det, och spetsen hamnar på samma ställe i tecknet som förut.
    const style = els[last] ? getComputedStyle(els[last]) : null
    const padY = style ? parseFloat(style.paddingTop) : 0
    const padRight = style ? parseFloat(style.paddingRight) : 0

    function letterPoint(i, progress) {
      const box = boxRef.current.getBoundingClientRect()
      const rect = els[i].getBoundingClientRect()
      return {
        x: rect.left - box.left + (rect.width - padRight) * progress,
        y: rect.top - box.top + padY + (rect.height - 2 * padY) * 0.72,
      }
    }

    // En punkt på linjen, `progress` från 0 (vänster) till 1 (höger). Ritningen är 440 x 22 (se viewBox nedan).
    function underlinePoint(progress) {
      const box = boxRef.current.getBoundingClientRect()
      const rect = underline.ownerSVGElement.getBoundingClientRect()
      const point = underline.getPointAtLength(length * progress)
      return { x: rect.left - box.left + (point.x * rect.width) / 440, y: rect.top - box.top + (point.y * rect.height) / 22 }
    }

    // Från `from` till `to`, mjukt. `hold` är hur stor del av pausen pennan först står still.
    function glide(from, to, progress, hold = 0.35) {
      const k = Math.min(1, Math.max(0, (progress - hold) / (1 - hold)))
      const ease = k * k * (3 - 2 * k)
      return { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease }
    }

    function tick(now) {
      const t = now - t0
      let point
      // Innan första tecknet (medan pennan kommer ned) vickar den inte.
      let resting = t < letters[0].start
      if (t < schedule.total) {
        let i = last
        while (i > 0 && (letters[i].start > t || !els[i])) i--
        const end = letters[i].start + letters[i].dur
        let next = i + 1
        while (next < els.length && !els[next]) next++
        if (t <= end || next >= els.length) {
          const progress = letters[i].dur ? Math.min(1, Math.max(0, (t - letters[i].start) / letters[i].dur)) : 1
          point = letterPoint(i, progress)
        } else if (lineOf[next] !== lineOf[i]) {
          resting = true
          point = glide(letterPoint(i, 1), letterPoint(next, 0), (t - end) / (letters[next].start - end))
        } else {
          // Mellan två ord glider pennan över mellanslaget, i stället för att hoppa när nästa ord börjar.
          point = glide(letterPoint(i, 1), letterPoint(next, 0), (t - end) / (letters[next].start - end), 0)
        }
        underline.style.strokeDashoffset = '1'
      } else if (t < schedule.total + UNDERLINE_PAUSE_MS) {
        resting = true
        point = glide(letterPoint(last, 1), underlinePoint(0), (t - schedule.total) / UNDERLINE_PAUSE_MS)
        underline.style.strokeDashoffset = '1'
      } else {
        const progress = Math.min(1, (t - schedule.total - UNDERLINE_PAUSE_MS) / UNDERLINE_MS)
        point = underlinePoint(progress)
        underline.style.strokeDashoffset = String(1 - progress)
      }
      pen.style.transform = `translate(${point.x}px, ${point.y}px)`
      pen.style.opacity = '1'
      pen.classList.toggle('is-resting', resting)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      underline.style.strokeDashoffset = ''
    }
    // `lines` är en ny array vid varje rendering; `text` avgör om något har ändrats.
  }, [phase, schedule, text])

  let offset = 0

  return (
    <h1 ref={boxRef} className={`hw-headline is-${phase}${className ? ` ${className}` : ''}`}>
      <span className="visually-hidden">{text}</span>
      {lines.map((line) => {
        const first = offset
        offset += line.length + 1
        // Orden hålls ihop, så att en rad bara bryts mellan två ord. `at` är ordets första tecken i raden.
        const words = []
        let at = 0
        for (const word of line.split(' ')) {
          words.push({ word, at })
          at += word.length + 1
        }
        return (
          <span key={line} className="hw-headline-line" aria-hidden="true">
            {words.map(({ word, at: wordAt }, w) => (
              <Fragment key={wordAt}>
                {w > 0 && ' '}
                <span className="hw-word">
                  {[...word].map((char, c) => {
                    const i = first + wordAt + c
                    const { start, dur } = schedule.letters[i]
                    return (
                      <span
                        key={i}
                        data-i={i}
                        className="hw-letter"
                        style={{ '--hw-delay': `${start}ms`, '--hw-dur': `${dur}ms` }}
                      >
                        {char}
                      </span>
                    )
                  })}
                </span>
              </Fragment>
            ))}
          </span>
        )
      })}
      <svg className="hw-underline" viewBox="0 0 440 22" aria-hidden="true">
        <path ref={underlineRef} d="M8 13 C100 2 205 19 300 9 S400 8 430 5" pathLength="1" />
      </svg>
      {(phase === 'writing' || penShown) && <Pen penRef={penRef} leaving={phase === 'done'} />}
    </h1>
  )
}

// En klassisk gul blyertspenna i samma stil som loggan (och Intressekompisen): en tjock svart kontur runt hela pennan,
// som ett klistermärke, och mjuk skuggning som ger djup (ljust till vänster, mörkare till höger). Lutad åt höger med
// spetsen längst ned till vänster: grafitspets, vässat trä, ett sexkantigt skaft med en glans, en blank metallhylsa och
// ett rosa suddgummi. Färgtoningarna följer med när pennan lutas (de ligger i pennans egna koordinater). Bara en penna
// syns åt gången, så id:na på toningarna krockar inte.
//
// Den vickar kring mitten (.hw-pen-wiggle), så att spetsen går upp och ned som när man skriver. Först kommer den ned
// mot pappret längs sitt eget skaft, som en hand som sätter ned pennan (.hw-pen-arrive), och när rubriken är klar
// (`leaving`) lyfts den upp samma väg och försvinner.
function Pen({ penRef, leaving }) {
  const across = { gradientUnits: 'userSpaceOnUse', x1: 3, y1: 0, x2: 13, y2: 0 }
  return (
    <svg ref={penRef} className={`hw-pen${leaving ? ' is-leaving' : ''}`} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="hw-pen-body" {...across}>
          <stop offset="0" stopColor="#ffe476" />
          <stop offset="0.45" stopColor="#f4c430" />
          <stop offset="1" stopColor="#c98f0a" />
        </linearGradient>
        <linearGradient id="hw-pen-wood" {...across}>
          <stop offset="0" stopColor="#f7dcb9" />
          <stop offset="1" stopColor="#cf9a63" />
        </linearGradient>
        <linearGradient id="hw-pen-metal" {...across}>
          <stop offset="0" stopColor="#a9adb2" />
          <stop offset="0.3" stopColor="#f4f5f6" />
          <stop offset="0.6" stopColor="#c3c6ca" />
          <stop offset="1" stopColor="#7d8186" />
        </linearGradient>
        <linearGradient id="hw-pen-rubber" {...across}>
          <stop offset="0" stopColor="#ffc9d5" />
          <stop offset="1" stopColor="#e2829a" />
        </linearGradient>
      </defs>
      <g className="hw-pen-arrive">
        <g className="hw-pen-wiggle">
          <g transform="rotate(35 8 60)" stroke="#1a1a1a" strokeLinejoin="round" strokeLinecap="round">
            {/* Den tjocka konturen runt hela pennan, bakom delarna. */}
            <path
              d="M8 60 L3.5 48 V16 H3 V10 H3.5 V5.5 Q3.5 2 8 2 Q12.5 2 12.5 5.5 V10 H13 V16 H12.5 V48 Z"
              fill="#1a1a1a"
              strokeWidth="3.4"
            />
            <g strokeWidth="1">
              <path d="M3.5 48 L8 60 L12.5 48 Z" fill="url(#hw-pen-wood)" />
              <path d="M6.2 55.2 L8 60 L9.8 55.2 Q8 56.2 6.2 55.2 Z" fill="#2b2b2b" />
              <path d="M3.5 48 Q5 46.6 6.5 48 Q8 46.6 9.5 48 Q11 46.6 12.5 48 V16 H3.5 Z" fill="url(#hw-pen-body)" />
              <path d="M6.5 47.4 V16.5 M9.5 47.4 V16.5" strokeWidth="0.7" opacity="0.55" />
              <rect x="3" y="10" width="10" height="6" rx="0.6" fill="url(#hw-pen-metal)" />
              <path d="M3.3 12 H12.7 M3.3 14 H12.7" strokeWidth="0.6" opacity="0.6" />
              <path d="M3.5 10 V5.5 Q3.5 2 8 2 Q12.5 2 12.5 5.5 V10 Z" fill="url(#hw-pen-rubber)" />
            </g>
            {/* Glansen, som på loggans spiraler: ljusa streck till vänster på skaftet, hylsan och suddgummit. */}
            <g stroke="#ffffff" strokeWidth="0.9" opacity="0.75">
              <path d="M4.9 44.5 V19" />
              <path d="M4.6 11.2 V14.8" />
              <path d="M5 8.6 V5.8 Q5.2 4 6.6 3.6" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  )
}

export default HandwrittenHeadline
