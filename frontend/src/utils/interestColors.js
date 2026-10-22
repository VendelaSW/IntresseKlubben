// Färgen på en intressetagg följer intressets huvudområde (Interest.area i
// backend), så att intressen som hör ihop syns som en grupp. Varje område har en
// fyllning för taggen och en ljusare nyans för underintressena. Texten är alltid
// mörkbrun (--color-text), med minst 11,5:1 i kontrast mot alla fyllningar.
// Samma som i teamets färgschema (intressen_fargschema.pdf). Ett nytt
// huvudområde i biblioteket (backend/app/data/interests.json) behöver läggas
// till här; tills dess får det den neutrala färgen.
const AREA_COLORS = {
  Musik: ['#ffd5d8', '#ffedee'],
  Dans: ['#ffcdc4', '#ffeeea'],
  'Scen och teater': ['#ffd9c4', '#ffefe6'],
  'Konst och museer': ['#fed3b2', '#fff0e3'],
  Skapande: ['#ffe0b7', '#fef1e2'],
  'Mode och stil': ['#efdaac', '#fbf3e1'],
  'Hem och inredning': ['#efe8b7', '#f7f4e1'],
  'Mat och dryck': ['#dae2b1', '#f2f6e3'],
  'Resor och äventyr': ['#d8f0c2', '#eef7e6'],
  'Fordon och motorsport': ['#c3e8c2', '#eaf8e9'],
  'Sport och träning': ['#c2f4d7', '#e6f9ed'],
  Friluftsliv: ['#b0ebd9', '#e3f9f2'],
  'Djur och natur': ['#b5f5ee', '#e2f9f6'],
  'Hälsa och välmående': ['#a9eaef', '#e1f9fb'],
  'Mystik och andlighet': ['#b5f2ff', '#e2f8fe'],
  Vetenskap: ['#b1e5ff', '#e3f7ff'],
  Teknik: ['#c3ecff', '#e6f6ff'],
  Gaming: ['#c4deff', '#eaf4ff'],
  'Spel och pussel': ['#d8e4ff', '#eef3ff'],
  'Film och tv': ['#dad6ff', '#f2f1ff'],
  'Podcasts och radio': ['#efdcff', '#f7f0ff'],
  'Böcker och litteratur': ['#efd0f9', '#fbefff'],
  Språk: ['#ffd7fa', '#feeefb'],
  Historia: ['#fecce5', '#ffedf7'],
  'Samhälle och engagemang': ['#ffd5e4', '#ffedf2'],
  // En sista utväg, medvetet neutral så att den inte konkurrerar. Också för okända områden.
  'Övrigt och nischat': ['#e9e4d8', '#f4f1ea'],
}

const NEUTRAL = AREA_COLORS['Övrigt och nischat']

// CSS-variablerna för en tagg i området: --tag-fill (taggen och rutan med
// underintressen) och --tag-sub (underintressena). Används som style på taggen.
export function areaColors(area) {
  const [fill, sub] = AREA_COLORS[area] ?? NEUTRAL
  return { '--tag-fill': fill, '--tag-sub': sub }
}
