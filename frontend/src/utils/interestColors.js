// Färgen på en intressetagg följer intressets huvudområde, så att intressen som
// hör ihop syns som en grupp. Varje område har en fyllning för taggen och en
// ljusare nyans för underintressena. Texten är alltid mörkbrun (--color-text),
// med minst 11,5:1 i kontrast mot alla fyllningar. Samma som i teamets
// färgschema (intressen_fargschema.pdf).
//
// Färgen slås upp på områdets slug (area_slug från backend), som inte ändras när
// området byter namn (Kreativitet heter fortfarande "skapande"). Namnet är en
// reserv för det som inte har någon slug, t.ex. förslag i intervjun. Ett nytt
// huvudområde i biblioteket (backend/app/data/interests.json) behöver läggas
// till här; tills dess får det den neutrala färgen.
const AREA_COLORS = {
  musik: ['#ffd5d8', '#ffedee'],
  dans: ['#ffcdc4', '#ffeeea'],
  'scen-och-teater': ['#ffd9c4', '#ffefe6'],
  'museer-och-konst': ['#fed3b2', '#fff0e3'],
  skapande: ['#ffe0b7', '#fef1e2'],
  'mode-och-stil': ['#efdaac', '#fbf3e1'],
  'hem-och-inredning': ['#efe8b7', '#f7f4e1'],
  'mat-och-dryck': ['#dae2b1', '#f2f6e3'],
  resor: ['#d8f0c2', '#eef7e6'],
  'fordon-och-motorsport': ['#c3e8c2', '#eaf8e9'],
  'sport-och-traning': ['#c2f4d7', '#e6f9ed'],
  friluftsliv: ['#b0ebd9', '#e3f9f2'],
  'djur-och-natur': ['#b5f5ee', '#e2f9f6'],
  'halsa-och-valmaende': ['#a9eaef', '#e1f9fb'],
  'mystik-och-andlighet': ['#b5f2ff', '#e2f8fe'],
  vetenskap: ['#b1e5ff', '#e3f7ff'],
  teknik: ['#c3ecff', '#e6f6ff'],
  'tv-spel': ['#c4deff', '#eaf4ff'],
  'spel-och-pussel': ['#d8e4ff', '#eef3ff'],
  'film-och-tv': ['#dad6ff', '#f2f1ff'],
  'podcasts-och-radio': ['#efdcff', '#f7f0ff'],
  bocker: ['#efd0f9', '#fbefff'],
  sprak: ['#ffd7fa', '#feeefb'],
  'kultur-och-samhalle-historia': ['#fecce5', '#ffedf7'],
  'samhalle-och-engagemang': ['#ffd5e4', '#ffedf2'],
  // En sista utväg, medvetet neutral så att den inte konkurrerar. Också för okända områden.
  'ovrigt-och-nischat': ['#e9e4d8', '#f4f1ea'],
}

// Reserven: områdenas namn (nuvarande och tidigare) till sluggen.
const SLUG_BY_NAME = {
  Musik: 'musik',
  Dans: 'dans',
  'Scen och teater': 'scen-och-teater',
  'Konst och museer': 'museer-och-konst',
  Kreativitet: 'skapande',
  Skapande: 'skapande',
  'Mode och stil': 'mode-och-stil',
  'Hem och inredning': 'hem-och-inredning',
  'Mat och dryck': 'mat-och-dryck',
  'Resor och äventyr': 'resor',
  'Fordon och motorsport': 'fordon-och-motorsport',
  'Sport och träning': 'sport-och-traning',
  Friluftsliv: 'friluftsliv',
  'Djur och natur': 'djur-och-natur',
  'Hälsa och välmående': 'halsa-och-valmaende',
  'Mystik och andlighet': 'mystik-och-andlighet',
  Vetenskap: 'vetenskap',
  Teknik: 'teknik',
  Gaming: 'tv-spel',
  'Sällskapsspel och pussel': 'spel-och-pussel',
  'Spel och pussel': 'spel-och-pussel',
  'Film och tv': 'film-och-tv',
  'Podcasts och radio': 'podcasts-och-radio',
  'Böcker och litteratur': 'bocker',
  Språk: 'sprak',
  Historia: 'kultur-och-samhalle-historia',
  'Samhälle och engagemang': 'samhalle-och-engagemang',
  'Övrigt och nischat': 'ovrigt-och-nischat',
}

const NEUTRAL = AREA_COLORS['ovrigt-och-nischat']

// CSS-variablerna för en tagg i området: --tag-fill (taggen och rutan med
// underintressen) och --tag-sub (underintressena). Används som style på taggen.
// `slug` är områdets slug när den finns, `area` dess namn (reserven).
export function areaColors(area, slug) {
  const [fill, sub] = AREA_COLORS[slug] ?? AREA_COLORS[SLUG_BY_NAME[area]] ?? NEUTRAL
  return { '--tag-fill': fill, '--tag-sub': sub }
}
