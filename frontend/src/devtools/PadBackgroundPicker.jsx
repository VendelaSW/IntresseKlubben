import { useState } from 'react'
import './padBackgrounds.css'
import './uiStyles.css'
import './matchCards.css'
import './matchLayout.css'
import '../components/events/eventCardVariants.css'

// TILLFÄLLIGT, bara i testläget: välj utseenden att jämföra (klubbkorten, sökraden, blockets rubrik
// och bakgrund, flikarna och Öppen/Privat-taggen). Varje val sparas i webbläsaren och läggs som ett data-attribut på
// <html> (se padBackgrounds.css, uiStyles.css och useDesignChoice), även i mobilvyns ram. Förvalt är utseendet som
// gäller nu ("pre-dev"), som också är det enda som finns utanför testläget. Tas bort när utseendena är valda; de
// valda flyttas då in i appen.
const PICKERS = [
  {
    key: 'testlage-klubbkort',
    attr: 'clubCard',
    label: 'Klubbkort',
    fallback: 'pre-dev',
    options: [
      { id: 'pre-dev', label: '0. Som nu (pre-dev)' },
      { id: '1', label: '1. Lapp' },
      { id: '2', label: '2. Kartotekskort' },
      { id: '3', label: '3. Akvarell' },
      { id: '4', label: '4. Post-it' },
      { id: '5', label: '5. Affisch' },
      { id: '6', label: '6. Modern affisch' },
      { id: '7', label: '7. Affisch (Nicklas variant)' },
    ],
  },
  {
    key: 'testlage-blockets-rubrik',
    attr: 'padHead',
    label: 'Blockets rubrik',
    fallback: 'pre-dev',
    options: [
      { id: 'pre-dev', label: '0. Som nu (pre-dev)' },
      { id: 'ny', label: '1. "← Klubbar" och skapa-knappen i rubriken' },
    ],
  },
  {
    key: 'blockets-bakgrund',
    attr: 'padBg',
    label: 'Blockets bakgrund',
    fallback: 'rutat',
    options: [
      { id: 'rutat', label: '1. Rutat (som nu, pre-dev)' },
      { id: 'vitt', label: '2. Vitt' },
      { id: 'linjerat', label: '3. Linjerat, vågräta rader' },
      { id: 'lodratt', label: '4. Lodräta linjer' },
      { id: 'prickat', label: '5. Prickat' },
      { id: 'akvarell', label: '6. Akvarellpapper' },
      { id: 'mjukt-rutat', label: '7. Mjukt rutat' },
      { id: 'akvarell-tvatt', label: '8. Akvarell: färgtvätt' },
      { id: 'akvarell-stank', label: '9. Akvarell: stänk' },
      { id: 'akvarell-himmel', label: '10. Akvarell: himmel' },
      { id: 'akvarell-atelje', label: '11. Akvarell: ateljé' },
      { id: 'akvarell-flackigt', label: '12. Akvarell: mjukt fläckigt' },
    ],
  },
  {
    key: 'flikar-och-sok',
    attr: 'uiStyle',
    label: 'Flikar',
    fallback: 'nu',
    options: [
      { id: 'nu', label: '1. Som nu' },
      { id: 'tunn', label: '2. Tunn bläcklinje' },
      { id: 'klister', label: '3. Klistermärken (Patrick Hand)' },
      { id: 'klister-kalam', label: '3b. Klistermärken (Kalam)' },
      { id: 'klister-shantell', label: '3c. Klistermärken (Shantell Sans)' },
      { id: 'register', label: '4. Registerflikar' },
      { id: 'handskrivet', label: '5. Handskrivet' },
    ],
  },
  {
    key: 'testlage-sokraden',
    attr: 'searchStyle',
    label: 'Sökraden (Klubbar)',
    fallback: 'pre-dev',
    options: [
      { id: 'pre-dev', label: '0. Som nu (pre-dev)' },
      { id: 'nu', label: '1. Runt sökfält med filterknappar' },
      { id: 'tunn', label: '2. Tunn bläcklinje' },
      { id: 'klister', label: '3. Klistermärken' },
      { id: 'register', label: '4. Papperslappar' },
      { id: 'handskrivet', label: '5. Handskrivet (en linje)' },
      { id: 'mjuk', label: '6. Mjuk fylld' },
      { id: 'svavande', label: '7. Svävande' },
    ],
  },
  {
    key: 'oppen-privat-tagg',
    attr: 'visStyle',
    label: 'Öppen/privat-tagg (klubbkort 1–6)',
    fallback: 'mjuk',
    options: [
      { id: 'mjuk', label: '1. Mjuk färg med hänglås' },
      { id: 'kontur', label: '2. Kontur' },
      { id: 'enkel', label: '3. Bara ikon och text' },
      { id: 'handritad', label: '4. Handritad' },
      { id: 'mork', label: '5. Mörk' },
      { id: 'stark', label: '6. Stark färg' },
      { id: 'nu', label: '7. Som förut (utan ikon)' },
      { id: 'stampel', label: '8. Stämpel (som på eventen)' },
    ],
  },
  {
    key: 'testlage-eventkort',
    attr: 'eventCard',
    label: 'Eventkort',
    fallback: 'pre-dev',
    options: [
      { id: 'pre-dev', label: '0. Som nu (pre-dev)' },
      { id: 'biljett', label: '1. Biljett' },
    ],
  },
  {
    key: 'testlage-forstasidan',
    attr: 'homePage',
    label: 'Förstasidan',
    fallback: 'pre-dev',
    options: [
      { id: 'pre-dev', label: '0. Som nu (pre-dev)' },
      { id: 'polaroider', label: '1. Polaroider' },
      { id: 'utspridda', label: '2. Polaroider, utspridda' },
      { id: 'kollage', label: '3. Kollage, tio polaroider' },
    ],
  },
  {
    key: 'testlage-matchningssidan',
    attr: 'matchLayout',
    label: 'Matchningssidan',
    fallback: 'nicklas-1',
    options: [
      { id: 'pre-dev', label: '0. Grund (som i PR:en)' },
      { id: 'nicklas-1', label: '1. Nicklas förslag 1' },
    ],
  },
  {
    key: 'testlage-matchningskort',
    attr: 'matchCard',
    label: 'Matchningskortets nivå',
    fallback: 'pre-dev',
    options: [
      { id: 'pre-dev', label: '0. Som nu (stämpel)' },
      { id: 'gnistor', label: '1. Gnistor (stjärnor under namnet)' },
      { id: 'tejp', label: '2. Tejp över kanten' },
    ],
  },
]

function saved({ key, fallback }) {
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function apply({ attr }, id) {
  document.documentElement.dataset[attr] = id
}

// Direkt när testläget startar, och när ett val ändras i ett annat fönster (mobilvyns ram).
PICKERS.forEach((picker) => apply(picker, saved(picker)))
window.addEventListener('storage', (event) => {
  const picker = PICKERS.find((p) => p.key === event.key)
  if (picker) apply(picker, event.newValue ?? picker.fallback)
})

function StylePicker({ picker }) {
  const [value, setValue] = useState(() => saved(picker))
  const id = `dev-panel-${picker.key}`

  function choose(next) {
    setValue(next)
    apply(picker, next)
    try {
      window.localStorage.setItem(picker.key, next)
    } catch {
      // Sparas inte, men stilen byts ändå.
    }
  }

  return (
    <>
      <label htmlFor={id}>{picker.label}</label>
      <select id={id} value={value} onChange={(e) => choose(e.target.value)}>
        {picker.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  )
}

function StylePickers() {
  return PICKERS.map((picker) => <StylePicker key={picker.key} picker={picker} />)
}

export default StylePickers
