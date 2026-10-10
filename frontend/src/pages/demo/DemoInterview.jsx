import { useEffect, useRef, useState } from 'react'
import FormField from '../../components/FormField'
import TextareaWithCount from '../../components/TextareaWithCount'
import { extractInterests } from '../../services/demoAi'
import InterestTree from './InterestTree'
import { DEMO_MUNICIPALITIES } from '../../services/demoData'
import { GENDER_OPTIONS } from '../../services/profile'

// Hälsningen: spelas på startsidan innan man har tryckt på "Starta intervjun". `captions`
// är undertexterna som visas under videon medan klippet spelas (för den som har ljudet
// av): `from` och `to` är sekunder i klippet. Filerna ligger i frontend/public/video (och
// nås som /video/...).
const INTRO = {
  video: '/video/intervju1_srgb.mp4',
  captions: [
    { from: 3.3, to: 5.6, text: 'Välkommen till Intresseklubben!' },
    { from: 5.7, to: 7.4, text: 'Jag antecknar.' },
  ],
}

// Stegen i intervjun. Varje steg är en fråga med ett eller flera fält, som visas på
// högerkanten medan Intressekompisen finns till vänster. `video` är klippet som spelas
// när steget visas, och därefter tar väntklippet över. Ett steg kan också ha `captions`
// (samma form som i INTRO).
const STEPS = [
  {
    id: 'namn',
    question: 'Vad heter du?',
    video: '/video/namn_fix.mp4',
    captions: [{ from: 1.2, to: 2.9, text: 'Vad heter du?' }],
  },
  {
    id: 'fodelse',
    question: 'När är du född, och vilket kön identifierar du dig med?',
    video: '/video/datum_ny_fix.mp4',
    captions: [{ from: 1.65, to: 3.0, text: 'Hur gammal är du?' }],
  },
  {
    id: 'plats',
    question: 'Var bor du?',
    video: '/video/stad_fix.mp4',
    captions: [{ from: 2.3, to: 3.8, text: 'Var bor du?' }],
  },
  {
    id: 'intressen',
    question: 'Berätta om dina intressen och vad du tycker om att göra!',
    video: '/video/intressen_ny_fix.mp4',
    captions: [{ from: 2.2, to: 3.2, text: 'Berätta om dina intressen!' }],
  },
  {
    id: 'person',
    question: 'Till sist.\nVem är du? Beskriv din personlighet!',
    video: '/video/person_fix.mp4',
    captions: [{ from: 0.9, to: 3.0, text: 'Berätta om din personlighet!' }],
  },
]

// Avslutningen: spelas samtidigt som analysen efter sista svaret. Mätaren går lika länge som
// klippet (längden läses ur filen, så att det stämmer även om klippet byts ut). Sedan visas
// tack-sidan, och Intressekompisen försvinner: klippet stoppas och bilden tas bort, så att
// tack-rutan hamnar mitt på sidan. FALLBACK_ANALYSIS_MS gäller tills längden är läst.
const OUTRO = { video: '/video/outro_fix.mp4' }
const FALLBACK_ANALYSIS_MS = 9400

// Alla klipp med undertexter, för att hitta det som visas just nu.
const ALL_CLIPS = [INTRO, ...STEPS, OUTRO]

// Väntklippen: när ett klipp har spelat klart loopas ett av dem, tills nästa klipp tar
// över (direkt, utan att vänta ut en runda). Intressekompisen står då och väntar medan man svarar. De turas om: efter ett
// svar kommer det ena, efter nästa svar det andra, och så vidare.
const IDLE_VIDEOS = ['/video/idle_fix.mp4', '/video/idle2_fix.mp4']

// Alla klipp ligger inladdade i sidan på en gång, staplade ovanpå varandra, så att ett klipp
// redan är avkodat när det tar över. Då blir bytet mellan klippen utan hack.
const CLIP_SOURCES = [...new Set([...ALL_CLIPS.map((c) => c.video), ...IDLE_VIDEOS])]

// Måste fälten fyllas i för att man ska komma vidare? Av i demon, så att man kan klicka sig
// igenom utan att skriva. I den riktiga profilen ska den vara på: backend kräver namn,
// födelsedatum, kön, stad och en text om en själv (ProfileCreate).
const REQUIRE_ANSWERS = false

// Korten här är fasta (inte klickbara), så de får den blå hårda skuggan som fasta kort har
// i stilguiden (samma som .card-wide).
const FIXED_CARD_SHADOW = { boxShadow: '0 6px 0 var(--color-line)' }

const EMPTY_ANSWERS = { name: '', birthDate: '', gender: '', municipality: '', district: '', likes: '', about: '' }

// Intervjun som sätt att skapa en profil: en fråga i taget på samma sida, i stället
// för ett långt formulär. Enter eller "Nästa" går vidare. Allt är en demo, så inget
// skickas eller sparas någonstans. Man kommer hit med ett klick från demons startsida,
// så videon (Intressekompisens hälsning) spelas direkt, medan rubriken och knappen
// "Starta intervjun" visas. Knappen visar första frågan. Webbläsare kan stoppa uppspelning
// med ljud innan man har klickat någonstans (t.ex. om sidan öppnas direkt från adressen).
// Då visas en knapp "Spela upp" under videon.
function DemoInterview() {
  // Videoelementen, med filen som nyckel.
  const videoEls = useRef({})
  const analysisStart = useRef(0)
  // Hur länge analysen tar: lika länge som avslutningsklippet.
  const [analysisMs, setAnalysisMs] = useState(FALLBACK_ANALYSIS_MS)
  const formRef = useRef(null)
  const [blocked, setBlocked] = useState(false)
  // Visas väntklippet i stället för stegets klipp?
  const [idle, setIdle] = useState(false)
  // Vilket väntklipp som är på tur. Börjar på det sista, så att det första klippet som tar slut
  // ger det första väntklippet.
  const [idleVariant, setIdleVariant] = useState(IDLE_VIDEOS.length - 1)
  // Undertexten som visas just nu (tom = ingen).
  const [caption, setCaption] = useState('')
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState(EMPTY_ANSWERS)
  const [finished, setFinished] = useState(false)
  // Mätaren efter sista svaret: null = ingen analys pågår, annars 0-100.
  const [analysis, setAnalysis] = useState(null)
  // Intressena en AI har läst ut ur intressetexten, som ett träd [{ name, aliases, subtags: [{ name, aliases, details }] }]
  // (huvudkategorier, underkategorier och detaljer, med alias), eller null om ingen har gjort det.
  const [foundInterests, setFoundInterests] = useState(null)
  // Hur det går med utläsningen: 'idle' (inte startad), 'pending' (pågår i bakgrunden), 'done' eller
  // 'failed'. Den startar redan när man går vidare från intressefrågan, så att den hinner bli klar
  // medan man skriver den sista frågan.
  const [extractionStatus, setExtractionStatus] = useState('idle')
  // Numret på senaste utläsningen och texten den gjordes på. Ett svar på en äldre utläsning (man
  // gick tillbaka och ändrade texten) kastas.
  const extractionId = useRef(0)
  const extractedText = useRef(null)

  const step = STEPS[index]
  const isLast = index === STEPS.length - 1
  // Hälsningen före start, sedan klippet för frågan man står på, och till sist avslutningen.
  // Det klippet vill man se (`wantedVideo`), men det som visas (`shownVideo`) byts först när
  // det nuvarande har spelat klart, så att inget klipp klipps av mitt i en rörelse.
  const clip = analysis !== null || finished ? OUTRO : started ? step : INTRO
  const wantedVideo = clip.video
  const [shownVideo, setShownVideo] = useState(INTRO.video)
  const pending = wantedVideo !== shownVideo
  const captions = ALL_CLIPS.find((c) => c.video === shownVideo)?.captions
  // Det som ska spelas just nu: väntklippet när ett klipp har spelat klart, annars klippet.
  const current = idle ? IDLE_VIDEOS[idleVariant] : shownVideo
  // Det som syns. Byts först när nästa klipp har börjat spela, så att det gamla ligger kvar
  // (på sin sista bild) tills det nya har en bild att visa.
  const [visible, setVisible] = useState(INTRO.video)

  const setAnswer = (field) => (event) => setAnswers((current) => ({ ...current, [field]: event.target.value }))

  // Klippet spelas så fort steget visas. Stoppar webbläsaren det (inget klick än, och
  // ljud) visas knappen "Spela upp".
  function playClip(element) {
    element
      ?.play()
      ?.then(() => setBlocked(false))
      .catch(() => setBlocked(true))
  }

  function play() {
    playClip(videoEls.current[current])
  }

  // Det som ska spelas byts: det nya klippet startas från början medan det gamla ligger kvar
  // synligt, och först när det nya har en bild på skärmen tar det över.
  useEffect(() => {
    setCaption('')
    const next = videoEls.current[current]
    if (!next) return undefined
    let revealed = false
    const reveal = () => {
      if (revealed) return
      revealed = true
      setVisible(current)
    }
    next.currentTime = 0
    next
      .play()
      .then(() => {
        setBlocked(false)
        if (next.requestVideoFrameCallback) next.requestVideoFrameCallback(reveal)
        else reveal()
      })
      .catch(() => {
        setBlocked(true)
        reveal()
      })
    // Om bildrutan aldrig meddelas (t.ex. i en bakgrundsflik) visas klippet ändå.
    const fallback = setTimeout(reveal, 400)
    return () => clearTimeout(fallback)
  }, [current])

  // De klipp som varken syns eller ska spelas pausas, så att inget ljud hörs i onödan.
  useEffect(() => {
    Object.entries(videoEls.current).forEach(([src, el]) => {
      if (el && src !== visible && src !== current) el.pause()
    })
  }, [visible, current])

  // Ett väntklipp väntar man inte ut: när nästa klipp ska spelas byts det direkt, mitt i
  // väntklippet (bytet är ändå utan blink, eftersom väntklippet ligger kvar tills det nya har
  // en bild). Står uppspelningen still (webbläsaren har stoppat den) finns inget att vänta på
  // heller, så då byts klippet direkt.
  useEffect(() => {
    if (pending && (idle || blocked)) {
      setIdle(false)
      setShownVideo(wantedVideo)
    }
  }, [pending, idle, blocked, wantedVideo])

  // Läser avslutningsklippets längd (bara metadata, ingen uppspelning) när sidan öppnas.
  useEffect(() => {
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.src = OUTRO.video
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) setAnalysisMs(probe.duration * 1000)
    }
    return () => {
      probe.onloadedmetadata = null
      probe.removeAttribute('src')
    }
  }, [])

  // Efter analysen visas ingen bild eller film mer: allt stoppas, så att inget ljud hörs.
  useEffect(() => {
    if (!finished) return
    Object.values(videoEls.current).forEach((el) => el?.pause())
  }, [finished])

  // Undertexten följer klippets tid. timeupdate kommer några gånger i sekunden.
  function handleTimeUpdate(event, src) {
    if (src !== current || idle) return
    const time = event.currentTarget.currentTime
    const cue = captions?.find((c) => time >= c.from && time < c.to)
    setCaption(cue ? cue.text : '')
  }

  // Ett klipp har spelat klart. Väntar nästa klipp spelas det direkt, annars tar ett väntklipp
  // över (väntklippen loopas och "tar aldrig slut").
  function handleEnded(src) {
    if (src !== current || idle) return
    setCaption('')
    if (pending) {
      setShownVideo(wantedVideo)
      return
    }
    setIdleVariant((variant) => (variant + 1) % IDLE_VIDEOS.length)
    setIdle(true)
  }

  // Videon spelas redan. Har webbläsaren stoppat den startar den med klicket.
  function start() {
    setStarted(true)
    if (blocked) play()
  }

  function goBack() {
    setIndex((current) => Math.max(0, current - 1))
  }

  // Tangentbordet: Enter och högerpil går vidare, Backspace och vänsterpil går tillbaka.
  // I ett textfält ska tangenterna fortfarande skriva och flytta markören, så där går
  // pilarna bara när markören står i kanten, och Backspace bara när fältet är tomt.
  // Datum och rullistor använder tangenterna själva och lämnas ifred.
  useEffect(() => {
    if (!started || finished || analysis !== null) return undefined
    function onKeyDown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const field = event.target
      if (field.tagName === 'INPUT' && field.type === 'date') return
      const isText = field.tagName === 'TEXTAREA' || (field.tagName === 'INPUT' && field.type === 'text')
      const isSelect = field.tagName === 'SELECT'
      if (event.key === 'Backspace' && !(isText && field.value !== '')) {
        event.preventDefault()
        goBack()
      } else if (event.key === 'ArrowLeft' && !isSelect && !(isText && (field.selectionStart !== 0 || field.selectionEnd !== 0))) {
        event.preventDefault()
        goBack()
      } else if (
        event.key === 'ArrowRight' &&
        !isSelect &&
        !(isText && (field.selectionStart !== field.value.length || field.selectionEnd !== field.value.length))
      ) {
        event.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [started, finished, analysis])

  // Analysen börjar när avslutningsklippet börjar spela, så att de tar slut samtidigt.
  useEffect(() => {
    if (shownVideo === OUTRO.video) analysisStart.current = performance.now()
  }, [shownVideo])

  // "Analysen" är bara en mätare som räknar upp till 100 på lika lång tid som avslutningsklippet. Ingen AI är inkopplad
  // än, så svaren skickas inte någonstans. Sedan visas tack-sidan.
  useEffect(() => {
    if (analysis === null || shownVideo !== OUTRO.video) return undefined
    if (analysis >= 100) {
      // Klart när klippets längd har gått: tack-sidan visas direkt, utan extra väntan.
      setAnalysis(null)
      setFinished(true)
      return undefined
    }
    // Den sista uppdateringen planeras till precis när tiden är slut.
    const remaining = analysisMs - (performance.now() - analysisStart.current)
    const tick = setTimeout(
      () => setAnalysis(Math.min(100, ((performance.now() - analysisStart.current) / analysisMs) * 100)),
      Math.max(0, Math.min(80, remaining)),
    )
    return () => clearTimeout(tick)
  }, [analysis, analysisMs, shownVideo])

  // AI:n läser intressetexten i bakgrunden. Samma text läses bara ut en gång (så att det går bra att
  // anropa den flera gånger), och ändras texten börjar den om. Misslyckas den (t.ex. utan nyckel) visas inga intressen alls, och
  // ingen varning.
  function startExtraction(text) {
    const trimmed = text.trim()
    if (extractedText.current === trimmed) return
    extractedText.current = trimmed
    const id = ++extractionId.current
    setFoundInterests(null)
    if (!trimmed) {
      setExtractionStatus('idle')
      return
    }
    setExtractionStatus('pending')
    extractInterests(trimmed)
      .then((interests) => {
        if (extractionId.current !== id) return
        setFoundInterests(interests)
        setExtractionStatus('done')
      })
      .catch(() => {
        if (extractionId.current !== id) return
        extractedText.current = null // så att den kan försöka igen
        setExtractionStatus('failed')
      })
  }

  function handleSubmit(event) {
    event.preventDefault()
    // Går man vidare från intressefrågan startar utläsningen direkt, medan man skriver nästa fråga.
    if (step.id === 'intressen') startExtraction(answers.likes)
    if (isLast) {
      setAnalysis(0)
      startExtraction(answers.likes) // gör inget om den redan är igång eller klar för samma text
    } else {
      setIndex(index + 1)
    }
  }

  // Enter går vidare, även i de flerradiga fälten. Shift+Enter ger en ny rad.
  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && event.target.tagName === 'TEXTAREA') {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  function restart() {
    setAnswers(EMPTY_ANSWERS)
    extractionId.current += 1
    extractedText.current = null
    setFoundInterests(null)
    setExtractionStatus('idle')
    setIndex(0)
    setFinished(false)
    setAnalysis(null)
    setStarted(false)
    setIdle(false)
    setIdleVariant(IDLE_VIDEOS.length - 1)
    setShownVideo(INTRO.video)
  }

  return (
    <div className="page">
      {/* Fast bredd, så att raden inte flyttar sig när innehållet i rutan byter (.page centrerar
            annars en rad som bara är så bred som innehållet). */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'flex-start', width: '100%', maxWidth: 960, marginTop: '2rem' }}>
        <div style={{ flex: '0 1 380px', width: '100%', maxWidth: 380, display: finished ? 'none' : 'block' }}>
          {/* Alla klipp ligger i sidan, staplade ovanpå varandra (alla är 720x720). Bara det som
              syns har full opacitet, så att byten sker utan att något laddas om eller blinkar. */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
            {CLIP_SOURCES.map((src) => (
              <video
                key={src}
                ref={(element) => {
                  videoEls.current[src] = element
                }}
                src={src}
                aria-label="Intressekompisen"
                aria-hidden={src !== visible}
                playsInline
                preload="auto"
                // Väntklippen loopas tills nästa klipp tar över.
                loop={IDLE_VIDEOS.includes(src)}
                onTimeUpdate={(event) => handleTimeUpdate(event, src)}
                onEnded={() => handleEnded(src)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: src === visible ? 1 : 0,
                  pointerEvents: 'none',
                }}
              />
            ))}
          </div>
          {/* Undertexter. Platsen är reserverad, så att inget under hoppar när texten byts. */}
          <p
            className="card-text"
            aria-live="polite"
            style={{ minHeight: '3.2rem', margin: '0.75rem 0 0', textAlign: 'center', fontSize: '1.2rem' }}
          >
            {caption}
          </p>
          {blocked && (
            <button type="button" className="secondary-button" style={{ marginTop: '1rem' }} onClick={play}>
              Spela upp
            </button>
          )}
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {!started ? (
            // Rubrik, text och knapp har samma mittlinje: allt är centrerat i kolumnen.
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <h1 className="app-title">Skapa din profil</h1>
              <p className="card-text" style={{ margin: '0.5rem 0 1.5rem' }}>
                Intressekompisen ställer några frågor, en i taget.
              </p>
              <button type="button" className="primary-button" onClick={start}>
                Starta intervjun
              </button>
            </div>
          ) : analysis !== null ? (
            <>
              <h1 className="app-title" style={{ textAlign: 'left' }}>
                Intresseklubbens AI analyserar dina svar.
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                <progress
                  max={100}
                  value={Math.round(analysis)}
                  aria-label="Analysen av dina svar"
                  style={{ flex: 1, height: '1.5rem', accentColor: 'var(--color-accent)' }}
                />
                <span style={{ minWidth: '3.5ch', textAlign: 'right' }}>{Math.round(analysis)}%</span>
              </div>
            </>
          ) : finished ? (
            <div className="card sheet content-stack" style={{ ...FIXED_CARD_SHADOW, margin: '0 auto' }}>
              <p className="card-title">Tack{answers.name.trim() && `, ${answers.name.trim()}`}!</p>
              <p className="card-text">Nu kan vi lättare matcha dig mot andra som delar dina intressen.</p>
              {/* Det AI:n hittade i det man skrev. Är utläsningen inte klar än står det så, och hittade
                  AI:n inget (en tom lista) står det också. Misslyckas den, t.ex. för att backend
                  körs utan nyckel, visas ingenting: varken intressen eller en varning. */}
              {(extractionStatus === 'pending' || extractionStatus === 'done') && (
                <div>
                  <p className="card-subheading">Dina intressen är:</p>
                  {extractionStatus === 'pending' ? (
                    <p className="hint-text" style={{ marginTop: '0.75rem' }}>
                      Läser ut dina intressen...
                    </p>
                  ) : foundInterests.length === 0 ? (
                    <p className="hint-text" style={{ marginTop: '0.75rem' }}>
                      Jag hittade inga tydliga intressen i det du skrev.
                    </p>
                  ) : (
                    <InterestTree interests={foundInterests} />
                  )}
                </div>
              )}
              <p className="card-text">Du kan alltid lägga till eller ta bort intressen senare. Säg bara till mig!</p>
              <button type="button" className="secondary-button" onClick={restart}>
                Börja om
              </button>
            </div>
          ) : (
            <>
              {/* pre-line gör att \n i frågan blir en radbrytning. */}
              <h1 className="app-title" style={{ textAlign: 'left', whiteSpace: 'pre-line' }}>
                {step.question}
              </h1>
              <p className="hint-text" style={{ textAlign: 'left', margin: '0.5rem 0' }}>
                Fråga {index + 1} av {STEPS.length}
              </p>
              <div className="card sheet" style={FIXED_CARD_SHADOW}>
                <form ref={formRef} className="auth-form form-wide form-compact" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
                  {step.id === 'namn' && (
                    <FormField id="interview-name" label="Namn">
                      <input
                        id="interview-name"
                        className="field-large"
                        type="text"
                        value={answers.name}
                        onChange={setAnswer('name')}
                        maxLength={50}
                        required={REQUIRE_ANSWERS}
                        autoFocus
                      />
                    </FormField>
                  )}

                  {step.id === 'fodelse' && (
                    <div className="form-row">
                      <FormField id="interview-birth" label="Födelsedatum">
                        <input
                          id="interview-birth"
                          type="date"
                          value={answers.birthDate}
                          onChange={setAnswer('birthDate')}
                          max={new Date().toISOString().slice(0, 10)}
                          required={REQUIRE_ANSWERS}
                          autoFocus
                        />
                      </FormField>
                      <FormField id="interview-gender" label="Kön">
                        <select id="interview-gender" value={answers.gender} onChange={setAnswer('gender')} required={REQUIRE_ANSWERS}>
                          <option value="">Välj...</option>
                          {GENDER_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    </div>
                  )}

                  {step.id === 'plats' && (
                    <div className="form-row">
                      <FormField id="interview-municipality" label="Stad">
                        <select
                          id="interview-municipality"
                          value={answers.municipality}
                          onChange={setAnswer('municipality')}
                          required={REQUIRE_ANSWERS}
                          autoFocus
                        >
                          <option value="">Välj...</option>
                          {DEMO_MUNICIPALITIES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField id="interview-district" label="Stadsdel (valfritt)">
                        <input
                          id="interview-district"
                          type="text"
                          value={answers.district}
                          onChange={setAnswer('district')}
                          maxLength={50}
                        />
                      </FormField>
                    </div>
                  )}

                  {step.id === 'intressen' && (
                    <FormField id="interview-likes" label="Berätta med egna ord">
                      <TextareaWithCount
                        id="interview-likes"
                        value={answers.likes}
                        onChange={setAnswer('likes')}
                        maxLength={1000}
                        rows={5}
                        placeholder="T.ex. jag gillar att klättra, spela brädspel och hänga med katter"
                        required={REQUIRE_ANSWERS}
                      />
                    </FormField>
                  )}

                  {step.id === 'person' && (
                    <FormField id="interview-about" label="Berätta mer om dig som person">
                      <TextareaWithCount
                        id="interview-about"
                        value={answers.about}
                        onChange={setAnswer('about')}
                        maxLength={800}
                        rows={6}
                        required={REQUIRE_ANSWERS}
                      />
                    </FormField>
                  )}

                  <div className="form-actions">
                    <button type="button" className="button-secondary" disabled={index === 0} onClick={goBack}>
                      Tillbaka
                    </button>
                    <button type="submit">{isLast ? 'Klar' : 'Nästa'}</button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default DemoInterview
