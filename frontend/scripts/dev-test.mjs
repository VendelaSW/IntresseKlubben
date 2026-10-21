// `npm run dev:test`: startar testläget, backend och frontend tillsammans (se CONTRIBUTING.md, "Testläge").
// Backend kör mot en egen SQLite-fil med testdata (aldrig Neon), frontend visar "Logga in som ..." och testpanelen.
//
// `npm run dev:telefon` (samma som `npm run dev:test -- --telefon`): som ovan, men så att en telefon på samma
// Wi-Fi når appen, för att testa den på riktigt (pekskärm, telefonens webbläsare, tangentbordet). Skriver ut en
// QR-kod att skanna. Alla på samma nätverk når då testkontona, så gör det hemma, inte på ett öppet nät.
//
// Ctrl+C stänger båda.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import qrcode from 'qrcode-terminal'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(frontend, '..', 'backend')
const FRONTEND_PORT = 5173
const BACKEND_PORT = 8000
const PHONE = process.argv.includes('--telefon')

// Datorns adress i det lokala nätverket (192.168.x.x, 10.x.x.x eller 172.16–31.x.x), som telefonen når den på.
function lanAddress() {
  const candidates = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address)
  const isPrivate = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  return candidates.find((ip) => ip.startsWith('192.168.')) ?? candidates.find(isPrivate) ?? null
}

const ip = PHONE ? lanAddress() : null
if (PHONE && !ip) {
  console.error('Hittar ingen adress i ett lokalt nätverk. Är datorn ansluten till Wi-Fi?')
  process.exit(1)
}
const host = ip ?? 'localhost'
const appUrl = `http://${host}:${FRONTEND_PORT}`
const apiUrl = `http://${ip ?? '127.0.0.1'}:${BACKEND_PORT}`
// Datorns egen webbläsare (localhost) ska alltid fungera, även när telefonen också gör det.
const corsOrigins = [`http://localhost:${FRONTEND_PORT}`, ...(ip ? [appUrl] : [])].join(',')

// Backendens Python: en virtuell miljö om det finns en, annars den som ligger i PATH.
function findPython() {
  const venvs = [join(backend, '.venv'), join(backend, 'venv'), join(frontend, '..', '.venv')]
  for (const venv of venvs) {
    for (const exe of [join(venv, 'Scripts', 'python.exe'), join(venv, 'bin', 'python')]) {
      if (existsSync(exe)) return exe
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

const children = []

function start(command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', ...options })
  child.on('exit', (code) => {
    if (code) console.error(`\n${command} avslutades med kod ${code}.`)
    stopAll(code ?? 0)
  })
  children.push(child)
  return child
}

let stopping = false
function stopAll(code) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exit(code)
}
process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

async function waitForBackend(seconds) {
  for (let i = 0; i < seconds * 4; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/health`)
      if (res.ok) return true
    } catch {
      // Inte uppe än.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

console.log('Startar testläget: backend med testdata, sedan frontend...')
start(findPython(), ['-m', 'app.devtools.server'], {
  cwd: backend,
  env: {
    ...process.env,
    DEV_FRONTEND_URL: appUrl,
    DEV_CORS_ORIGINS: corsOrigins,
    DEV_BACKEND_HOST: ip ? '0.0.0.0' : '127.0.0.1',
    DEV_BACKEND_PORT: String(BACKEND_PORT),
    PYTHONIOENCODING: 'utf-8',
  },
})

if (!(await waitForBackend(90))) {
  console.error('Backend kom inte igång. Se felet ovan (saknas paketen? Kör pip install -r requirements-dev.txt i backend/).')
  stopAll(1)
}

// Vite direkt via node (inget skal), på en fast port så att backendens CORS stämmer.
const viteArgs = [join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(FRONTEND_PORT), '--strictPort']
if (ip) viteArgs.push('--host', '0.0.0.0')
start(process.execPath, viteArgs, {
  cwd: frontend,
  env: {
    ...process.env,
    VITE_DEV_MODE: '1',
    VITE_API_URL: apiUrl,
    // Testpanelen visar adressen, så att man hittar den även när terminalen är långt bort.
    VITE_DEV_PHONE_URL: ip ? appUrl : '',
  },
})

if (ip) {
  // Efter en stund, så att QR-koden hamnar under Vites egen utskrift och inte försvinner i den.
  setTimeout(() => {
    console.log(`\nTestläget på telefonen: skanna koden eller öppna ${appUrl}`)
    console.log('Telefonen måste vara på samma Wi-Fi som datorn. Frågar Windows om brandväggen: tillåt privata nätverk.\n')
    qrcode.generate(appUrl, { small: true })
  }, 1500)
}
