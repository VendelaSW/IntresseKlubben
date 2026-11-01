import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AddInterest, { AddInterestError } from '../components/AddInterest'
import FormField from '../components/FormField'
import InterestTree, { descendantKeys, withoutDuplicates } from '../components/InterestTree'
import TextareaWithCount from '../components/TextareaWithCount'
import BirthDatePicker from '../components/BirthDatePicker'
import MunicipalityPicker from '../components/MunicipalityPicker'
import NewProfileImage from '../components/NewProfileImage'
import { useAuth } from '../hooks/useAuth'
import { ApiError } from '../services/api'
import { analyzeInterests, completeInterview } from '../services/interview'
import { sealInterest, suggestInterest } from '../services/interests'
import { ABOUT_AI_NOTE, ABOUT_LABEL_SHORT, ABOUT_PLACEHOLDER, GENDER_OPTIONS, checkProfileText, genderLabel, getMunicipalities, getProfile, uploadResizedImage } from '../services/profile'

// Klippen ligger i frontend/public/video/intervju (och nås som /video/intervju/...).
const VIDEO_DIR = '/video/intervju/'
const clipFile = (name) => `${VIDEO_DIR}${name}_fix.mp4`

// Väntklippen: när ett klipp har spelat klart loopas ett av dem, tills nästa klipp tar över (direkt, utan att vänta ut
// en runda). Intressekompisen står då och väntar medan man svarar. Varje klipp (och steg) har sin lista: i en lista med
// flera turas klippen om, efter ett svar kommer det ena, efter nästa svar det andra, och så vidare.
const IDLE_EARLY = [clipFile('idle1'), clipFile('idle2')]
// Från frågan om intressen och därefter, till sista frågan och vidare till avslutningen.
const IDLE_LATE = [clipFile('idle3')]

// Hälsningen: spelas på startsidan innan man har tryckt på "Starta intervjun". `captions` är undertexterna som visas under
// videon medan klippet spelas (för den som har ljudet av): `from` och `to` är sekunder i klippet.
const INTRO = {
  video: clipFile('intro'),
  idle: IDLE_EARLY,
  captions: [
    { from: 3.3, to: 5.6, text: 'Välkommen till Intresseklubben!' },
    { from: 5.7, to: 7.3, text: 'Jag antecknar.' },
  ],
}

// Stegen i intervjun. Varje steg är en fråga med ett eller flera fält, som visas på
// högerkanten medan Intressekompisen finns till vänster. `video` är klippet som spelas
// när steget visas, och därefter tar väntklippet (`idle`) över. Ett steg kan också ha `then`, ett andra klipp som
// spelas direkt efter det första (innan väntklippet), och `captions` (samma form som i INTRO).
const STEPS = [
  {
    id: 'namn',
    question: 'Vad heter du?',
    video: clipFile('vadheterdu'),
    idle: IDLE_EARLY,
    captions: [{ from: 0.95, to: 2.7, text: 'Vad heter du?' }],
  },
  {
    id: 'fodelse',
    question: 'När är du född, och vilket kön identifierar du dig med?',
    video: clipFile('hurgammaardu'),
    idle: IDLE_EARLY,
    captions: [{ from: 0.3, to: 3.0, text: 'Hur gammal är du?' }],
  },
  {
    id: 'plats',
    question: 'Var bor du?',
    video: clipFile('varbordu'),
    idle: IDLE_EARLY,
    captions: [{ from: 2.2, to: 3.65, text: 'Var bor du?' }],
  },
  {
    id: 'intressen',
    question: 'Berätta om dina intressen och vad du tycker om att göra!',
    video: clipFile('beratta_intressen1'),
    then: clipFile('beratta_intressen2'),
    idle: IDLE_LATE,
    captions: [{ from: 0.3, to: 4.9, text: 'Berätta om dina intressen!' }],
  },
  {
    id: 'person',
    question: 'Till sist.\nBeskriv dig själv och vad du söker här!',
    video: clipFile('vemardu'),
    idle: IDLE_LATE,
    captions: [{ from: 0.5, to: 3.0, text: 'Vem är du och vad söker du?' }],
  },
]

// Avslutningen: spelas samtidigt som analysen efter sista svaret. Mätaren går lika länge som
// klippet (längden läses ur filen, så att det stämmer även om klippet byts ut). Sedan visas
// tack-sidan, och Intressekompisen försvinner: klippet stoppas och bilden tas bort, så att
// tack-rutan hamnar mitt på sidan. FALLBACK_ANALYSIS_MS gäller tills längden är läst.
const OUTRO = { video: clipFile('outro') }
const FALLBACK_ANALYSIS_MS = 9400

// Alla klipp, för att hitta det som visas just nu. Ett andra klipp i ett steg (`then`) är ett eget klipp, med `from` som
// pekar på stegets första klipp, och har samma väntklipp som steget.
const ALL_CLIPS = [
  INTRO,
  ...STEPS.flatMap((step) => (step.then ? [step, { video: step.then, from: step.video, idle: step.idle }] : [step])),
  OUTRO,
]
const IDLE_VIDEOS = [...new Set([...IDLE_EARLY, ...IDLE_LATE])]

// Alla klipp ligger inladdade i sidan på en gång, staplade ovanpå varandra, så att ett klipp
// redan är avkodat när det tar över. Då blir bytet mellan klippen utan hack.
const CLIP_SOURCES = [...new Set([...ALL_CLIPS.map((c) => c.video), ...IDLE_VIDEOS])]

// Korten här är fasta (inte klickbara), så de får den blå hårda skuggan som fasta kort har
// i stilguiden (samma som .card-wide).
const FIXED_CARD_SHADOW = { boxShadow: '0 6px 0 var(--color-line)' }

// Åldern i hela år för ett födelsedatum på formen ÅÅÅÅ-MM-DD, eller null om datumet saknas.
function ageFrom(birthDate) {
  if (!birthDate) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  const today = new Date()
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day)
  return today.getFullYear() - year - (hadBirthday ? 0 : 1)
}

const EMPTY_ANSWERS = { name: '', birthDate: '', gender: '', municipality: '', district: '', likes: '', about: '' }

// Intervjun som sätt att skapa en profil: en fråga i taget på samma sida, i stället
// för ett långt formulär. Enter eller "Nästa" går vidare. Videon (Intressekompisens hälsning)
// spelas direkt, medan rubriken och knappen "Starta intervjun" visas. Knappen visar första
// frågan. Webbläsare kan stoppa uppspelning med ljud innan man har klickat någonstans (t.ex.
// när sidan öppnas direkt från adressen). Då visas en knapp "Spela upp" under videon.
//
// När intervjun är klar skapas profilen och intressena i ett anrop (POST /profile/interview/complete): bara de
// intressen man behållit sparas, och inget skickas förrän man trycker på "Skapa min profil".
function ProfileInterview() {
  // Videoelementen, med filen som nyckel.
  const videoEls = useRef({})
  const analysisStart = useRef(0)
  // Hur länge analysen tar: lika länge som avslutningsklippet.
  const [analysisMs, setAnalysisMs] = useState(FALLBACK_ANALYSIS_MS)
  const formRef = useRef(null)
  const [blocked, setBlocked] = useState(false)
  // Kommunerna på frågan "Var bor du?", [{ code, name }]. Samma lista som profilsidan använder.
  const [municipalities, setMunicipalities] = useState([])
  useEffect(() => {
    getMunicipalities()
      .then(setMunicipalities)
      .catch(() => setMunicipalities([]))
  }, [])
  // Visas väntklippet i stället för stegets klipp?
  const [idle, setIdle] = useState(false)
  // Hur många gånger ett väntklipp har börjat spelas, för att turas om mellan väntklippen i klippets lista.
  const [idleCount, setIdleCount] = useState(0)
  // Undertexten som visas just nu (tom = ingen).
  const [caption, setCaption] = useState('')
  const [started, setStarted] = useState(false)
  // Förhandskontrollen av Om mig-texten när man går vidare från sista frågan: pågår den, och vad den sa om texten nekades.
  const [checkingAbout, setCheckingAbout] = useState(false)
  const [aboutError, setAboutError] = useState('')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState(EMPTY_ANSWERS)
  const [finished, setFinished] = useState(false)
  // Mätaren efter sista svaret: null = ingen analys pågår, annars 0-100.
  const [analysis, setAnalysis] = useState(null)
  // Analysen av intressetexten, som omgångar: [{ id, text, token, proposals }]. Den första görs i bakgrunden när man
  // går vidare från intressefrågan, så att den hinner bli klar medan man skriver den sista frågan, och fler läggs till
  // med "Lägg till intresse". Varje omgång har sitt eget sigill (token), som frontend bara skickar tillbaka
  // oförändrat när profilen sparas.
  const [batches, setBatches] = useState([])
  // Förslag användaren tagit bort, som `${omgångens id}:${förslagets nyckel}`. De skickas inte med när man sparar.
  const [removed, setRemoved] = useState(() => new Set())
  // Hur det går med analysen: 'idle' (ingen text), 'pending', 'done' eller 'failed'.
  const [analysisStatus, setAnalysisStatus] = useState('idle')
  const [analysisError, setAnalysisError] = useState('')
  // Numret på senaste analysen och texten den gjordes på. Ett svar på en äldre analys (man gick tillbaka och
  // ändrade texten) kastas.
  const analysisId = useRef(0)
  const analyzedText = useRef(null)
  const nextBatchId = useRef(1)
  // "Lägg till intresse"
  // Att spara profilen
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // Profilbilden man valt på sista sidan (skalad, men uppladdad först när profilen är skapad), och felet om uppladdningen
  // misslyckades efter att profilen redan sparats.
  const [pendingImage, setPendingImage] = useState(null)
  const [imageError, setImageError] = useState('')
  const [saveStatus, setSaveStatus] = useState(null) // HTTP-koden på felet, för att veta vad man kan göra åt det
  // Har sigillen gått ut (400 vid sparande)? Då får man tolka texterna på nytt.
  const [expired, setExpired] = useState(false)
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  // Intervjun är till för den som inte har en profil än. Har man en skickas man till startsidan, så att man inte
  // skapar en till. Tills det är kollat visas ingenting.
  const [checkingProfile, setCheckingProfile] = useState(true)
  useEffect(() => {
    getProfile()
      .then((profile) => {
        if (profile) navigate('/hem', { replace: true })
        else setCheckingProfile(false)
      })
      .catch(() => setCheckingProfile(false)) // går det inte att kolla får man ändå fortsätta
  }, [navigate])

  const step = STEPS[index]
  const isLast = index === STEPS.length - 1
  // Hälsningen före start, sedan klippet för frågan man står på, och till sist avslutningen.
  // Det klippet vill man se (`wantedVideo`), men det som visas (`shownVideo`) byts först när
  // det nuvarande har spelat klart, så att inget klipp klipps av mitt i en rörelse.
  const clip = analysis !== null || finished ? OUTRO : started ? step : INTRO
  const wantedVideo = clip.video
  const [shownVideo, setShownVideo] = useState(INTRO.video)
  const shownClip = ALL_CLIPS.find((c) => c.video === shownVideo)
  // Stegets andra klipp (`then`) räknas som att rätt klipp visas, fast det inte är det första.
  const pending = wantedVideo !== shownVideo && shownClip?.from !== wantedVideo
  const captions = shownClip?.captions
  // Det som ska spelas just nu: väntklippet när ett klipp har spelat klart, annars klippet.
  const idleList = shownClip?.idle ?? IDLE_EARLY
  const current = idle ? idleList[(idleCount - 1) % idleList.length] : shownVideo
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
  // Körs först när videoelementen finns: medan sidan väntar på profilkollen (checkingProfile) visas ingenting.
  useEffect(() => {
    if (checkingProfile) return undefined
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
  }, [current, checkingProfile])

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
    // Stegets andra klipp spelas direkt efter det första.
    if (shownClip?.then) {
      setShownVideo(shownClip.then)
      return
    }
    setIdleCount((count) => count + 1)
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

  // Felet som ska visas för användaren: backendens svenska meddelande när det finns, annars ett allmänt.
  const messageOf = (error) =>
    error instanceof ApiError ? error.message : 'Något gick fel. Kontrollera anslutningen och försök igen.'

  // AI:n läser intressetexten i bakgrunden. Samma text läses bara ut en gång (så att det går bra att anropa den
  // flera gånger), och ändras texten börjar den om. Misslyckas den (503 när AI:n inte svarar) visas meddelandet
  // på sista sidan, tillsammans med en länk till att välja intressen i listan i stället.
  function startExtraction(text) {
    const trimmed = text.trim()
    if (analyzedText.current === trimmed) return
    analyzedText.current = trimmed
    const id = ++analysisId.current
    setBatches([])
    setRemoved(new Set())
    setAnalysisError('')
    setExpired(false)
    if (!trimmed) {
      setAnalysisStatus('idle')
      return
    }
    setAnalysisStatus('pending')
    analyzeInterests(trimmed)
      .then((data) => {
        if (analysisId.current !== id) return
        setBatches([{ id: 0, kind: 'text', text: trimmed, token: data.token, proposals: data.proposals }])
        setAnalysisStatus('done')
      })
      .catch((error) => {
        if (analysisId.current !== id) return
        analyzedText.current = null // så att den kan försöka igen
        setAnalysisError(messageOf(error))
        setAnalysisStatus('failed')
      })
  }

  // Förslagen som visas: de som inte är borttagna. Nycklarna får omgångens id framför sig, så att de är unika över
  // alla omgångar.
  const qualify = (batch, key) => `${batch.id}:${key}`
  const everyProposal = batches.flatMap((batch) =>
    batch.proposals.map((p) => ({
      ...p,
      key: qualify(batch, p.key),
      interest: { ...p.interest, parent_key: p.interest.parent_key ? qualify(batch, p.interest.parent_key) : null },
    })),
  )
  const visibleProposals = everyProposal.filter((p) => !removed.has(p.key))

  // Tar bort ett intresse, och det som ligger under det.
  function removeProposal(key) {
    setRemoved((current) => new Set([...current, ...descendantKeys(everyProposal, key)]))
    setSaveError('')
  }

  // Intressena som redan är valda (id), så att sökningen visar dem som valda.
  const selectedIds = visibleProposals.map((p) => p.interest.id).filter((id) => id !== null)

  // Ett nytt intresse med egna ord, godkänt av backend (se AddInterest): ännu en omgång med eget sigill. Det som redan finns
  // bland intressena (de som tagits bort räknas inte) läggs inte till igen.
  async function addNewInterest(result) {
    const fresh = withoutDuplicates(result.proposals, visibleProposals)
    if (fresh.length === 0) throw new AddInterestError('Det intresset finns redan bland dina intressen.')
    setBatches((current) => [
      ...current,
      { id: nextBatchId.current++, kind: 'phrase', text: result.text, token: result.token, proposals: fresh },
    ])
  }

  // Ett befintligt intresse valt ur sökningen: det får ett sigill (utan AI) och läggs som en egen omgång, eftersom
  // intervjun bara sparar förslag med sigill.
  async function pickExistingInterest(interest) {
    if (selectedIds.includes(interest.id)) return
    const result = await sealInterest(interest)
    setBatches((current) => [
      ...current,
      { id: nextBatchId.current++, kind: 'pick', interestId: interest.id, token: result.token, proposals: result.proposals },
    ])
  }

  // Går tillbaka till sista frågan för att ändra sin text (t.ex. när "Om mig" nekades). Intressena man valt bort och
  // lagt till finns kvar, eftersom intressetexten inte ändras.
  function editAnswers() {
    setFinished(false)
    setAnalysis(null)
    // Avslutningsklippet är stoppat och spelar inte klart igen, så klippet för sista frågan sätts direkt. Annars väntar
    // det på att avslutningen ska ta slut och startar aldrig.
    setIdle(false)
    setShownVideo(STEPS[STEPS.length - 1].video)
    setIndex(STEPS.length - 1)
    setSaveError('')
    setSaveStatus(null)
  }

  // Sigillen gäller i 30 minuter. Har de gått ut tolkas texterna om, och man får välja bort det man ville ta bort igen.
  async function reanalyze() {
    setSaving(true)
    setSaveError('')
    try {
      const fresh = await Promise.all(
        batches.map(async (batch) => {
          // Varje sorts omgång tolkas om på sitt sätt: intressetexten, ett nytt intresse med egna ord, eller ett befintligt.
          const data =
            batch.kind === 'phrase'
              ? await suggestInterest(batch.text)
              : batch.kind === 'pick'
                ? await sealInterest({ id: batch.interestId })
                : await analyzeInterests(batch.text)
          return { ...batch, token: data.token, proposals: data.proposals }
        }),
      )
      setBatches(fresh)
      setRemoved(new Set())
      setExpired(false)
    } catch (error) {
      setSaveError(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  // Profilen är skapad: resten av appen låses upp (se RequireProfile) och man går till startsidan.
  function finish() {
    updateUser({ ...user, profile_completed: true })
    navigate('/hem')
  }

  // Skapar profilen och intressena i ett anrop. Bara omgångar med något kvar skickas, och bara de förslag som inte
  // är borttagna: det som inte skickas med räknas som bortvalt.
  async function handleSave() {
    const approved = batches
      .map((batch) => ({
        token: batch.token,
        items: batch.proposals
          .filter((p) => !removed.has(qualify(batch, p.key)))
          .map((p) => (p.activity ? { key: p.key, activity: p.activity } : { key: p.key })),
      }))
      .filter((batch) => batch.items.length > 0)
    if (approved.length === 0) {
      setSaveError('Välj minst ett intresse.')
      return
    }
    setSaving(true)
    setSaveError('')
    setSaveStatus(null)
    try {
      await completeInterview({
        name: answers.name.trim(),
        birth_date: answers.birthDate,
        gender: answers.gender,
        municipality_code: answers.municipality,
        profile_text: answers.about.trim(),
        district: answers.district.trim() || null,
        batches: approved,
      })
      // Profilen finns nu, så bilden kan laddas upp. Misslyckas det är profilen ändå sparad, och bilden kan läggas till
      // under Redigera profil: man får veta det och går vidare med "Fortsätt".
      if (pendingImage) {
        try {
          await uploadResizedImage(pendingImage)
        } catch (error) {
          setImageError(`Profilen är skapad, men bilden kunde inte laddas upp: ${messageOf(error)}`)
          return
        }
      }
      // Nu är profilen klar, så resten av appen låses upp (se RequireProfile).
      finish()
    } catch (error) {
      setExpired(error instanceof ApiError && error.status === 400)
      setSaveStatus(error instanceof ApiError ? error.status : null)
      setSaveError(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (checkingAbout) return
    // Går man vidare från intressefrågan startar utläsningen direkt, medan man skriver nästa fråga.
    if (step.id === 'intressen') startExtraction(answers.likes)
    if (isLast) {
      // Om mig-texten kontrolleras innan avslutningen och analysen börjar, så att man får veta att den nekas medan
      // man fortfarande står kvar vid fältet. Kontrollen vid sparandet ligger kvar som skydd.
      setCheckingAbout(true)
      setAboutError('')
      try {
        await checkProfileText(answers.about.trim())
      } catch (error) {
        setAboutError(messageOf(error))
        return
      } finally {
        setCheckingAbout(false)
      }
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
    analysisId.current += 1
    analyzedText.current = null
    setBatches([])
    setRemoved(new Set())
    setAnalysisStatus('idle')
    setAnalysisError('')
    setSaveError('')
    setExpired(false)
    setIndex(0)
    setFinished(false)
    setAnalysis(null)
    setStarted(false)
    setIdle(false)
    setIdleCount(0)
    setPendingImage(null)
    setShownVideo(INTRO.video)
  }

  if (checkingProfile) return null

  // Raderna på profilen på sista sidan: bara det man fyllde i.
  const age = ageFrom(answers.birthDate)
  const municipalityName = municipalities.find((m) => m.code === answers.municipality)?.name
  const place = [municipalityName, answers.district.trim()].filter(Boolean).join(', ')
  const profileRows = [
    ['Ålder', age !== null && age >= 0 ? `${age} år` : null],
    ['Kön', genderLabel(answers.gender)],
    ['Plats', place || null],
  ].filter(([, value]) => value)

  return (
    <div className="page interview-page">
      {/* Fast bredd, så att raden inte flyttar sig när innehållet i rutan byter (.page centrerar
            annars en rad som bara är så bred som innehållet). Måtten står i index.css ("Intervjun"): på mobil
            är Intressekompisen liten med undertexten bredvid medan frågorna ställs, så att frågan och
            formuläret syns utan att man scrollar. */}
      <div className="interview-layout">
        <div
          className={`interview-kompis${started ? ' is-asking' : ''}`}
          style={finished ? { display: 'none' } : undefined}
        >
          {/* Alla klipp ligger i sidan, staplade ovanpå varandra (alla är 720x720). Bara det som
              syns har full opacitet, så att byten sker utan att något laddas om eller blinkar. */}
          <div className="interview-video">
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
          <p className={`card-text interview-caption${caption ? '' : ' is-empty'}`} aria-live="polite">
            {caption}
          </p>
          {blocked && (
            <button type="button" className="secondary-button" style={{ marginTop: '1rem' }} onClick={play}>
              Spela upp
            </button>
          )}
        </div>

        <div className="interview-main">
          {!started ? (
            // Rubrik, text och knapp har samma mittlinje: allt är centrerat i kolumnen.
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <h1 className="app-title">Skapa din profil</h1>
              <p className="card-text" style={{ margin: '0.5rem 0 1.5rem' }}>
                Intressekompisen ställer några frågor, en i taget.
              </p>
              <button type="button" className="primary-button interview-start" onClick={start}>
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
            <>
              <h1 className="app-title" style={{ textAlign: 'center' }}>
                Tack!
              </h1>
              <p className="card-text" style={{ textAlign: 'center', margin: '0.5rem 0 1rem' }}>
                Nu kan vi lättare matcha dig mot andra som delar dina intressen.
              </p>
              <div className="card sheet content-stack interview-summary" style={{ ...FIXED_CARD_SHADOW, margin: '0 auto' }}>
                <p className="card-title">Det här är din profil{answers.name.trim() && `, ${answers.name.trim()}`}</p>
                {/* Det man svarade, bara det som är ifyllt. */}
                <NewProfileImage name={answers.name} image={pendingImage} onChange={setPendingImage} />
                {profileRows.length > 0 && (
                  <dl className="profile-details">
                    {profileRows.map(([label, value]) => (
                      <Fragment key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                )}
                {/* Förslagen från analysen. Man kan ta bort ett intresse (och det som ligger under det) med krysset och
                    lägga till ett genom att skriva det: texten tolkas på samma sätt. Det som är kvar när man sparar är
                    det som godkänns. */}
                <div>
                  <p className="card-subheading" style={{ textAlign: 'center' }}>
                    Dina intressen:
                  </p>
                  {analysisStatus === 'pending' ? (
                    <p className="hint-text" style={{ marginTop: '0.75rem' }}>
                      Läser ut dina intressen...
                    </p>
                  ) : analysisStatus === 'failed' ? (
                    <p className="form-error" style={{ marginTop: '0.75rem' }}>
                      {analysisError} <Link to="/profil?lista=1">Välj dina intressen i listan i stället</Link>
                    </p>
                  ) : visibleProposals.length === 0 ? (
                    <p className="hint-text" style={{ marginTop: '0.75rem' }}>
                      {batches.length > 0
                        ? 'Du har tagit bort alla intressen. Lägg till något nedan.'
                        : 'Jag hittade inga tydliga intressen i det du skrev. Lägg till något nedan.'}
                    </p>
                  ) : (
                    <InterestTree proposals={visibleProposals} onRemove={removeProposal} />
                  )}
                  {analysisStatus !== 'pending' && analysisStatus !== 'failed' && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <AddInterest selectedIds={selectedIds} onPickExisting={pickExistingInterest} onAddNew={addNewInterest} />
                    </div>
                  )}
                </div>
                {answers.about.trim() && (
                  <div style={{ width: '100%' }}>
                    <p className="card-subheading" style={{ textAlign: 'center' }}>
                      Det här är du:
                    </p>
                    <p
                      className="card-text"
                      style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere', textAlign: 'center' }}
                    >
                      {answers.about.trim()}
                    </p>
                  </div>
                )}
                <p className="hint-text">Du kan ändra din profil och dina intressen senare om vi missat något!</p>
                {saveError && <p className="form-error">{saveError}</p>}
                {imageError && <p className="form-error">{imageError} Du kan lägga till den under Redigera profil.</p>}
                {saveStatus === 422 && (
                  <button type="button" className="secondary-button" disabled={saving} onClick={editAnswers}>
                    Ändra mina svar
                  </button>
                )}
                {/* Huvudknappen störst, och "Börja om" liten och tätt under, så att
                    man inte trycker på den av misstag. */}
                <div className="interview-save-buttons">
                  {imageError ? (
                    <button type="button" className="primary-button button-large" onClick={finish}>
                      Fortsätt
                    </button>
                  ) : expired ? (
                    <button type="button" className="primary-button button-large" disabled={saving} onClick={reanalyze}>
                      {saving ? 'Tolkar...' : 'Tolka om'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-button button-large"
                      disabled={saving || analysisStatus === 'pending' || visibleProposals.length === 0}
                      onClick={handleSave}
                    >
                      {saving ? 'Sparar...' : 'Skapa min profil'}
                    </button>
                  )}
                  {!imageError && (
                    <button type="button" className="secondary-button button-small" disabled={saving} onClick={restart}>
                      Börja om
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* pre-line gör att \n i frågan blir en radbrytning. */}
              {/* På mobil står framsteget ovanför frågan, med en stapel (se .interview-heading i index.css). */}
              <div className="interview-heading">
                <h1 className="app-title interview-question">{step.question}</h1>
                <p className="hint-text interview-progress">
                  Fråga {index + 1} av {STEPS.length}
                </p>
                <div className="interview-progress-bar" aria-hidden="true">
                  <span style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
                </div>
              </div>
              <div className="card sheet interview-card" style={FIXED_CARD_SHADOW}>
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
                        autoComplete="name"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        required
                        autoFocus
                      />
                    </FormField>
                  )}

                  {step.id === 'fodelse' && (
                    <div className="form-row">
                      <FormField id="interview-birth" label="Födelsedatum">
                        <BirthDatePicker
                          id="interview-birth"
                          value={answers.birthDate}
                          onChange={(birthDate) => setAnswers((current) => ({ ...current, birthDate }))}
                          required
                          autoFocus
                        />
                      </FormField>
                      <FormField id="interview-gender" label="Kön">
                        <select id="interview-gender" value={answers.gender} onChange={setAnswer('gender')} required>
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
                      <FormField id="interview-municipality" label="Kommun">
                        <MunicipalityPicker
                          id="interview-municipality"
                          municipalities={municipalities}
                          value={answers.municipality}
                          onChange={(code) => setAnswers((current) => ({ ...current, municipality: code }))}
                          required
                          autoFocus
                        />
                        <p className="hint-text">Bor du i en mindre ort? Välj kommunen den ligger i, t.ex. Härryda för Mölnlycke.</p>
                      </FormField>
                      <FormField id="interview-district" label="Stadsdel (valfritt)">
                        <input
                          id="interview-district"
                          type="text"
                          value={answers.district}
                          onChange={setAnswer('district')}
                          maxLength={50}
                          autoComplete="off"
                          autoCapitalize="words"
                          enterKeyHint="next"
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
                        required
                      />
                    </FormField>
                  )}

                  {step.id === 'person' && (
                    <FormField id="interview-about" label={ABOUT_LABEL_SHORT}>
                      <TextareaWithCount
                        id="interview-about"
                        value={answers.about}
                        onChange={(event) => {
                          setAnswer('about')(event)
                          setAboutError('')
                        }}
                        maxLength={800}
                        rows={6}
                        placeholder={ABOUT_PLACEHOLDER}
                        required
                      />
                      <p className="hint-text">{ABOUT_AI_NOTE}</p>
                      {aboutError && <p className="form-error">{aboutError}</p>}
                    </FormField>
                  )}

                  <div className="form-actions interview-actions">
                    <button type="button" className="button-secondary interview-back" disabled={index === 0} onClick={goBack}>
                      Tillbaka
                    </button>
                    <button type="submit" className="interview-next" disabled={checkingAbout}>
                      {checkingAbout ? 'Kontrollerar...' : isLast ? 'Klar' : 'Nästa'}
                    </button>
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

export default ProfileInterview
