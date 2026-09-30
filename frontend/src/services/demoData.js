// Påhittad data för demo-flödet under /demo. Ingenting här kommer från
// eller skickas till backend. Byt ut mot riktiga API-anrop allteftersom
// funktionerna byggs på riktigt.

export const DEMO_INTERESTS = [
  'Brädspel',
  'Klättring',
  'Keramik',
  'Dykning',
  'Fotboll',
  'Löpning',
  'Fotografering',
  'Stickning',
  'Schack',
  'Matlagning',
  'Vandring',
  'Yoga',
  'Tv-spel',
  'Bokcirkel',
  'Musik',
  'Trädgård',
]

// Ett litet urval. Den riktiga profilsidan hämtar alla 290 från /municipalities/.
export const DEMO_MUNICIPALITIES = [
  'Göteborg',
  'Mölndal',
  'Partille',
  'Kungälv',
  'Härryda',
  'Stockholm',
  'Malmö',
  'Uppsala',
]

export const DEMO_PEOPLE = [
  {
    id: 1,
    name: 'Emmy',
    age: 24,
    municipality: 'Göteborg',
    district: 'Majorna',
    distanceKm: 1.2,
    interests: ['Brädspel', 'Klättring', 'Keramik'],
    bio: 'Letar efter folk att spela längre brädspel med på vardagskvällar.',
  },
  {
    id: 2,
    name: 'Ali',
    age: 31,
    municipality: 'Göteborg',
    district: 'Linnéstaden',
    distanceKm: 2.0,
    interests: ['Fotboll', 'Löpning', 'Matlagning'],
    bio: 'Spelar korpfotboll och vill hitta fler att springa med på morgonen.',
  },
  {
    id: 3,
    name: 'Sara',
    age: 27,
    municipality: 'Mölndal',
    district: 'Centrum',
    distanceKm: 6.5,
    interests: ['Keramik', 'Stickning', 'Trädgård'],
    bio: 'Har en drejskiva hemma och delar gärna med mig.',
  },
  {
    id: 4,
    name: 'Jonas',
    age: 42,
    municipality: 'Göteborg',
    district: 'Hisingen',
    distanceKm: 4.8,
    interests: ['Dykning', 'Fotografering', 'Vandring'],
    bio: 'Fotograferar under vattnet. Söker dykbuddy inför sommaren.',
  },
  {
    id: 5,
    name: 'Linnea',
    age: 22,
    municipality: 'Göteborg',
    district: 'Johanneberg',
    distanceKm: 2.7,
    interests: ['Brädspel', 'Tv-spel', 'Bokcirkel'],
    bio: 'Plugga, spela, läsa. I den ordningen, typ.',
  },
  {
    id: 6,
    name: 'Mikael',
    age: 35,
    municipality: 'Partille',
    district: 'Centrum',
    distanceKm: 9.1,
    interests: ['Schack', 'Musik', 'Brädspel'],
    bio: 'Spelar schack på nätet men saknar att sitta mittemot någon.',
  },
  {
    id: 7,
    name: 'Fatima',
    age: 29,
    municipality: 'Göteborg',
    district: 'Örgryte',
    distanceKm: 3.3,
    interests: ['Yoga', 'Vandring', 'Matlagning'],
    bio: 'Vandrar gärna i Delsjöområdet på helgerna.',
  },
  {
    id: 8,
    name: 'Oskar',
    age: 26,
    municipality: 'Kungälv',
    district: 'Ytterby',
    distanceKm: 14.0,
    interests: ['Klättring', 'Löpning', 'Fotografering'],
    bio: 'Klättrar inomhus på vintern och ute på sommaren.',
  },
]

// Hur relationen till varje person ser ut när demon startar, så att
// förfrågningar och kontakter inte är tomma första gången man tittar.
// 'incoming' = personen har skickat en förfrågan till dig.
export const DEMO_START_RELATIONS = {
  3: 'incoming',
  6: 'incoming',
  7: 'contact',
}

export const DEMO_CLUBS = [
  {
    id: 1,
    name: 'Majornas brädspelskväll',
    interest: 'Brädspel',
    municipality: 'Göteborg',
    members: 12,
    meets: 'Torsdagar 18.00 på ett café i Majorna',
    description: 'Vi spelar allt från snabba kortspel till långa strategispel. Nybörjare välkomna.',
  },
  {
    id: 2,
    name: 'Drejgänget',
    interest: 'Keramik',
    municipality: 'Mölndal',
    members: 7,
    meets: 'Varannan lördag i en gemensam ateljé',
    description: 'Vi delar på ugn och lera. Ta med förkläde.',
  },
  {
    id: 3,
    name: 'Morgonlöparna',
    interest: 'Löpning',
    municipality: 'Göteborg',
    members: 23,
    meets: 'Tisdagar och fredagar 06.30 vid Slottsskogen',
    description: '5–8 km i lugnt tempo. Ingen lämnas efter.',
  },
  {
    id: 4,
    name: 'Västkustens dykare',
    interest: 'Dykning',
    municipality: 'Göteborg',
    members: 9,
    meets: 'Helger när vädret tillåter',
    description: 'Vi samåker till dykplatser längs kusten och delar utrustningstips.',
  },
  {
    id: 5,
    name: 'Schack i parken',
    interest: 'Schack',
    municipality: 'Partille',
    members: 5,
    meets: 'Söndagar 14.00 i Partille centrum',
    description: 'Ta med ett bräde om du har, annars lånar vi ut.',
  },
]
