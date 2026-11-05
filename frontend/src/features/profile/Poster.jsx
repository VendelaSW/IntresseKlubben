import { posterStrip } from '../../utils/matchPoster'

// Affischen: samma utseende för en person överallt, på matchningskortet, personkorten (Sök, Förfrågningar, Kompisar) och
// profilen. Utseendet finns i features/profile/poster.css.

// Pappret: vitt utan kant, en färgad rad överst i färgerna på personens områden (de ni har gemensamt först, se
// posterStrip), rasterprickar i det övre hörnet och en mjuk skugga med en lätt lutning. `interests` är personens intressen
// och `sharedIds` (en Set) ens egna, för ordningen i raden. `as` är elementet (t.ex. 'article'), och övriga props hamnar på
// det.
export function PosterCard({ as: Tag = 'div', interests, sharedIds, className, style, children, ...rest }) {
  const [color, stops] = posterStrip(interests, sharedIds)
  return (
    <Tag
      className={`poster-card${className ? ` ${className}` : ''}`}
      style={{ '--poster': color, '--poster-strip': stops, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// Namnet i raka tryckbokstäver. `lines` (valfri) är hur många rader det får ta, sedan "…" (på korten, där hela namnet står
// på profilen). `as` är elementet, t.ex. 'h1' på profilen.
export function PosterName({ as: Tag = 'p', lines, className, style, children }) {
  return (
    <Tag
      className={`poster-name${lines ? ' poster-name-clamped' : ''}${className ? ` ${className}` : ''}`}
      style={lines ? { '--poster-name-lines': lines, ...style } : style}
    >
      {children}
    </Tag>
  )
}

// En kort uppgift i en svart ruta med ljus text, lite sned, t.ex. orten på korten eller åldern och orten på profilen.
export function PlaceStamp({ as: Tag = 'p', className, children }) {
  return <Tag className={`poster-stamp${className ? ` ${className}` : ''}`}>{children}</Tag>
}

// Om mig med det gula strecket till vänster. Med `heading` (t.ex. "Om mig" på profilen) står rubriken ovanför texten,
// innanför strecket. Texten kan kortas med "…" efter `--about-lines` rader (se .poster-about, och fitAboutText i
// MatchPanel), men bara med `clamp`. Ingenting visas om texten saknas.
export function PosterAbout({ text, heading, clamp = false }) {
  if (!text) return null
  const paragraph = <p className={`poster-about${clamp ? ' poster-about-clamped' : ''}`}>{text}</p>
  if (!heading) return paragraph
  return (
    <section className="poster-about-section">
      <h2>{heading}</h2>
      {paragraph}
    </section>
  )
}
