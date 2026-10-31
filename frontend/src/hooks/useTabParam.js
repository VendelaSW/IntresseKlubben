import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

// Vald flik på sidor med flikar (Personer, Brev, Klubbar och Events). Fliken
// står i adressen (?flik=kompisar), så att Tillbaka och webbläsarens bakåt
// kommer tillbaka till samma flik, även i kartans block. Ett flikbyte byter ut
// sidan i historiken i stället för att lägga till en, så att Tillbaka går till
// förra sidan och inte till förra fliken.
//
// `tabs` är sidans flikar ({ id, label }). I adressen står etiketten utan
// accenter och mellanslag ("Mina klubbar" -> mina-klubbar). Ger [id för vald
// flik, eller null om ingen står i adressen (sidan väljer då själv), setTab].
// setTab(id) visar listan på fliken; resten av adressen (t.ex. en öppen klubb)
// tas bort.
const slug = (label) =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')

export function useTabParam(tabs) {
  const [searchParams, setSearchParams] = useSearchParams()
  const current = tabs.find((t) => slug(t.label) === searchParams.get('flik'))

  function setTab(id) {
    const tab = tabs.find((t) => t.id === id)
    setSearchParams({ flik: slug(tab.label) }, { replace: true })
  }

  return [current?.id ?? null, setTab]
}

// Nollställer sök och filter när man byter flik (SCRUM-325), så att en flik aldrig är filtrerad på något man valt
// på en annan. Gäller alla sätt att byta flik, också knappar som "Se alla klubbar". `reset` körs bara vid ett byte,
// inte när sidan öppnas. Sorteringen är inget filter och får ligga kvar.
// `tab` är null medan listan inte visas (t.ex. när en klubb eller ett event är öppet och fliken inte står i
// adressen): då räknas det inte som ett byte, så filtret finns kvar när man går tillbaka till samma flik.
export function useResetOnTabChange(tab, reset) {
  const [seenTab, setSeenTab] = useState(tab)
  if (tab !== null && tab !== seenTab) {
    setSeenTab(tab)
    if (seenTab !== null) reset()
  }
}
