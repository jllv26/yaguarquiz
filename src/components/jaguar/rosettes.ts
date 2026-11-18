/**
 * Rosetas de jaguar "reales": anillos rotos en 3–5 trazos gruesos con 1–3 puntos dentro
 * (lo que distingue al jaguar del leopardo y del guepardo). Determinístico por semilla.
 */
export type RosettePart = { kind: 'arc'; d: string; w: number } | { kind: 'dot'; cx: number; cy: number; r: number }

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n: number) => n.toFixed(1)

export function rosetteParts(x: number, y: number, r: number, seed: number, center = true): RosettePart[] {
  const rand = rng(seed)
  const parts: RosettePart[] = []
  const pieces = 3 + Math.floor(rand() * 3)
  const start = rand() * Math.PI * 2
  const slice = (Math.PI * 2) / pieces
  for (let i = 0; i < pieces; i++) {
    const a0 = start + i * slice + slice * (0.08 + rand() * 0.12)
    const a1 = start + (i + 1) * slice - slice * (0.1 + rand() * 0.18)
    const rr = r * (0.85 + rand() * 0.3)
    const x0 = x + Math.cos(a0) * rr
    const y0 = y + Math.sin(a0) * rr
    const x1 = x + Math.cos(a1) * rr
    const y1 = y + Math.sin(a1) * rr
    parts.push({ kind: 'arc', d: `M${f(x0)} ${f(y0)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x1)} ${f(y1)}`, w: r * (0.38 + rand() * 0.22) })
  }
  if (center) {
    const dots = 1 + Math.floor(rand() * 3)
    for (let i = 0; i < dots; i++) {
      parts.push({ kind: 'dot', cx: x + (rand() - 0.5) * r * 0.7, cy: y + (rand() - 0.5) * r * 0.7, r: r * (0.13 + rand() * 0.1) })
    }
  }
  return parts
}

/** Versión en texto SVG (para mosaicos data-URI). */
export function rosetteSvg(x: number, y: number, r: number, seed: number, color: string) {
  return rosetteParts(x, y, r, seed)
    .map((p) =>
      p.kind === 'arc'
        ? `<path d='${p.d}' stroke='${color}' stroke-width='${f(p.w)}' stroke-linecap='round' fill='none'/>`
        : `<circle cx='${f(p.cx)}' cy='${f(p.cy)}' r='${f(p.r)}' fill='${color}'/>`,
    )
    .join('')
}

/** Mosaico de piel de jaguar (240×240) como data-URI. */
export function jaguarTile(color: string) {
  const spots: [number, number, number][] = [
    [34, 38, 15], [104, 26, 11], [176, 44, 16], [70, 92, 13], [146, 104, 15], [216, 112, 11],
    [22, 140, 12], [96, 160, 16], [178, 178, 13], [40, 210, 14], [128, 222, 11], [222, 226, 10],
  ]
  let body = spots.map(([x, y, r], i) => rosetteSvg(x, y, r, i * 7 + 3, color)).join('')
  // manchas sueltas pequeñas
  ;[[60, 60, 3], [200, 80, 2.6], [120, 130, 3], [60, 186, 2.6], [200, 150, 3], [160, 10, 2.4]].forEach(([x, y, r]) => {
    body += `<circle cx='${x}' cy='${y}' r='${r}' fill='${color}'/>`
  })
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>${body}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
