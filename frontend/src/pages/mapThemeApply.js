import { setBuildingTheme } from './mapPrototypeBuildings'
import { setDoodleTheme } from './mapPrototypeDoodles'

// TILLFÄLLIGT (testläget): lägger valen från mapThemes.js på kartan som redan är igång. Linjerna är CSS-variabler på
// `root`, kartans lager får nya färger och husen ritas om. Papperet ändras aldrig.
export function applyMapTheme(map, root, theme) {
  const css = {
    '--map-line': theme.line,
    '--map-margin': theme.margin,
    '--map-grid-line': theme.gridLine,
    '--map-gap': theme.gap,
    '--map-glow': theme.glow,
    '--map-glow-top': theme.glowTop,
  }
  Object.entries(css).forEach(([name, value]) => root.style.setProperty(name, value))

  const [a, b, c, d] = theme.regions
  const regions = ['match', ['get', 'farg'], 0, a, 1, b, 2, c, d]
  const paints = [
    ['lan-fill', 'fill-color', regions],
    ['landskap-fill', 'fill-color', regions],
    ['forest', 'fill-color', theme.forest],
    ['forest-edge', 'line-color', theme.forestInk],
    ['shoreline', 'line-color', theme.water],
    ['waterway', 'line-color', theme.water],
    ['roads-minor', 'line-color', theme.pencilLight],
    ['roads-major', 'line-color', theme.pencil],
    ['landskap-borders', 'line-color', theme.border],
    ['lan-borders', 'line-color', theme.border],
    ['kommun-borders', 'line-color', theme.pencil],
    ['sweden-edge', 'line-color', theme.pencilLight],
  ]
  const k = theme.roadScale
  const widths = (...stops) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flatMap(([zoom, width]) => [zoom, width * k])]
  paints.push(
    ['roads-major', 'line-width', widths([8, 0.8], [12, 1.6], [17, 4])],
    ['roads-minor', 'line-width', widths([13, 0.8], [17, 2])],
    ['roads-minor', 'line-dasharray', theme.minorDash],
    ['forest', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 12, Math.min(1, 0.75 * theme.forestScale), 14, Math.min(1, 0.3 * theme.forestScale), 16, Math.min(1, 0.15 * theme.forestScale)]],
    ['forest-edge', 'line-opacity', theme.forestScale > 0 ? 1 : 0],
  )
  if (theme.roadColor) paints.push(['roads-major', 'line-color', theme.roadColor], ['roads-minor', 'line-color', theme.roadColor])
  // Hela linjer går inte att få med setPaintProperty(null) i alla lägen, så ett långt streck utan glapp används.
  paints.push(['roads-major', 'line-dasharray', theme.roadDash ?? [1, 0]])
  for (const layer of ['forest-pines-edge', 'forest-pines-inner']) {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', theme.pines ? 'visible' : 'none')
  }
  root.dataset.mapNames = theme.names

  // Marken är kartans bakgrundslager, och masken utanför Sverige (map-sketch-outside) täcker resten. Vattnet får en
  // botten i pappersfärg, så att marken inte syns under vattnets mönster.
  if (!map.getLayer('water-base')) {
    map.addLayer({ id: 'water-base', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' }, 'water')
  }
  paints.push(
    ['paper', 'background-color', theme.ground],
    ['paper', 'background-opacity', theme.groundOpacity],
    ['water-base', 'fill-color', '#f7f1e3'],
    ['water-base', 'fill-opacity', theme.groundOpacity > 0 ? 1 : 0],
  )
  paints.forEach(([layer, property, value]) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value)
  })
  setDoodleTheme(map, theme)
  setBuildingTheme(theme)
}
