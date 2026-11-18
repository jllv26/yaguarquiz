import { useId } from 'react'
import { rosetteParts } from './rosettes'

const INK = '#15100B'
type P = [number, number]

/** Polígono de un segmento de pata (ahusado) de A a B. */
function limb(a: P, b: P, wa: number, wb: number) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const pts = [
    [a[0] + (nx * wa) / 2, a[1] + (ny * wa) / 2],
    [b[0] + (nx * wb) / 2, b[1] + (ny * wb) / 2],
    [b[0] - (nx * wb) / 2, b[1] - (ny * wb) / 2],
    [a[0] - (nx * wa) / 2, a[1] - (ny * wa) / 2],
  ]
  return 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join('L') + 'Z'
}
const rad = (d: number) => (d * Math.PI) / 180
/** Punto a distancia L desde j con ángulo a (0 = hacia abajo, + = hacia adelante). */
const step = (j: P, L: number, a: number): P => [j[0] + Math.sin(rad(a)) * L, j[1] + Math.cos(rad(a)) * L]

type LegSpec = { root: P; l1: number; l2: number; w: [number, number, number] }
const FRONT: LegSpec = { root: [58, 2], l1: 46, l2: 40, w: [30, 13, 10] }
const HIND: LegSpec = { root: [-62, -2], l1: 50, l2: 46, w: [40, 14, 10] }

function legPath(spec: LegSpec, a1: number, a2: number) {
  const knee = step(spec.root, spec.l1, a1)
  const paw = step(knee, spec.l2, a2)
  return { d: limb(spec.root, knee, spec.w[0], spec.w[1]) + limb(knee, paw, spec.w[1], spec.w[2]), paw, knee, r: spec.w[1] / 2 }
}

/** Ángulos del galope. s = sin de la fase: +1 extendido (vuelo), −1 recogido. */
function pose(phase: number, leap: number) {
  const s0 = Math.sin(phase * Math.PI * 2)
  const s = s0 * (1 - leap) + 1 * leap
  const fA1 = 8 + 42 * s
  const fA2 = fA1 - 55 * ((1 - s) / 2)
  const hA1 = -6 - 44 * s
  const hA2 = hA1 - 10 - 50 * ((1 - s) / 2)
  return { s, fA1, fA2, hA1, hA2 }
}

/**
 * Jaguar de perfil corriendo (dibujo propio, piel con rosetas reales).
 * phase 0..1 recorre un ciclo de galope; leap 0..1 lo lleva a la postura de salto.
 */
export function JaguarRunner({ phase, leap = 0, roar = false, className }: { phase: number; leap?: number; roar?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  const near = pose(phase, leap)
  const far = pose(phase + 0.13, leap)
  const nf = legPath(FRONT, near.fA1, near.fA2)
  const nh = legPath(HIND, near.hA1, near.hA2)
  const ff = legPath(FRONT, far.fA1, far.fA2)
  const fh = legPath(HIND, far.hA1, far.hA2)
  const bob = -5 * near.s
  const pitch = 3 * Math.cos(phase * Math.PI * 2) * (1 - leap) - 4 * leap
  const tail = 10 * Math.sin(phase * Math.PI * 2 + 1) * (1 - leap) - 12 * leap

  return (
    <svg viewBox="-150 -110 330 210" className={className} aria-hidden>
      <defs>
        <pattern id={`fur-${id}`} width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <rect width="56" height="56" fill="#D89A36" />
          {[
            [14, 14, 7, 1],
            [42, 22, 6, 2],
            [26, 44, 7.5, 3],
            [52, 50, 4, 4],
          ].flatMap(([x, y, r, sd]) =>
            rosetteParts(x, y, r, sd * 5).map((p, j) =>
              p.kind === 'arc' ? (
                <path key={`${sd}-${j}`} d={p.d} stroke={INK} strokeWidth={p.w} strokeLinecap="round" fill="none" />
              ) : (
                <circle key={`${sd}-${j}`} cx={p.cx} cy={p.cy} r={p.r} fill={INK} />
              ),
            ),
          )}
        </pattern>
        <pattern id={`furd-${id}`} width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <rect width="56" height="56" fill="#9C6420" />
          <circle cx="14" cy="14" r="5" fill={INK} opacity="0.6" />
          <circle cx="40" cy="36" r="5" fill={INK} opacity="0.6" />
        </pattern>
        <linearGradient id={`belly-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#F3E4C2" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <g transform={`translate(0 ${bob}) rotate(${pitch})`} strokeLinejoin="round">
        {/* patas del lado lejano */}
        <path d={fh.d} fill={`url(#furd-${id})`} />
        <circle cx={fh.knee[0]} cy={fh.knee[1]} r={fh.r} fill={`url(#furd-${id})`} />
        <path d={ff.d} fill={`url(#furd-${id})`} />
        <circle cx={ff.knee[0]} cy={ff.knee[1]} r={ff.r} fill={`url(#furd-${id})`} />
        <ellipse cx={fh.paw[0]} cy={fh.paw[1]} rx="9" ry="5" fill="#7E4E18" />
        <ellipse cx={ff.paw[0]} cy={ff.paw[1]} rx="9" ry="5" fill="#7E4E18" />

        {/* cola */}
        <g transform={`rotate(${tail} -88 -8)`}>
          <path d="M-88 -10 C-112 -4 -128 6 -136 26 C-138 34 -132 38 -128 32 C-120 14 -106 6 -86 2 Z" fill={`url(#fur-${id})`} />
          <path d="M-136 26 C-138 34 -132 38 -128 32 L-131 24 Z" fill={INK} />
        </g>

        {/* cuerpo */}
        <path
          d="M-94 -6 C-92 -32 -52 -36 -10 -32 C30 -28 60 -38 84 -30 C100 -24 102 0 92 16 C78 30 40 26 10 24 C-30 24 -66 32 -86 18 C-96 10 -96 0 -94 -6 Z"
          fill={`url(#fur-${id})`}
        />
        <path d="M-86 18 C-66 32 -30 24 10 24 C40 26 78 30 92 16 L92 8 C70 18 30 14 -10 16 C-50 18 -74 22 -90 10 Z" fill={`url(#belly-${id})`} stroke="none" />

        {/* cuello y cabeza */}
        <path d="M74 -30 C90 -44 112 -48 126 -42 L130 -14 C116 -2 98 8 80 12 Z" fill={`url(#fur-${id})`} />
        <g transform={`rotate(${-pitch * 0.8} 126 -34)`}>
          <path d="M108 -42 C112 -58 132 -62 148 -56 C160 -52 170 -44 174 -38 C178 -32 176 -26 170 -24 C164 -22 158 -20 152 -16 C142 -10 124 -10 114 -18 C106 -24 104 -34 108 -42 Z" fill={`url(#fur-${id})`} />
          {/* hocico claro */}
          <path d="M152 -32 C162 -34 172 -32 174 -36 C178 -30 176 -26 170 -24 C162 -22 156 -20 150 -18 Z" fill="#F3E4C2" stroke="none" />
          {/* oreja */}
          <path d="M118 -52 Q120 -68 134 -58 Z" fill="#9C6420" /><path d="M121 -55 Q123 -63 130 -58 Z" fill={INK} />
          {/* ojo y lágrima */}
          <path d="M144 -45 Q151 -50 158 -45 Q151 -40 144 -45 Z" fill="#F2C032" stroke={INK} strokeWidth="1.8" /><ellipse cx="152" cy="-45" rx="1.2" ry="2.6" fill={INK} />
          <path d="M147 -42 L150 -28" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
          {/* nariz */}
          <path d="M172 -40 L177 -36 L172 -33 Z" fill="#3E2219" />
          {roar ? (
            <g>
              <path d="M150 -22 L176 -30 L172 -10 L154 -12 Z" fill="#240B07" />
              <path d="M168 -28 L170 -20 L172 -28 Z" fill="#fff" stroke="none" />
              <path d="M160 -12 L162 -18 L164 -12 Z" fill="#fff" stroke="none" />
            </g>
          ) : (
            <path d="M170 -26 L156 -22" stroke={INK} strokeWidth="2" fill="none" />
          )}
        </g>

        {/* patas del lado cercano */}
        <path d={nh.d} fill={`url(#fur-${id})`} />
        <circle cx={nh.knee[0]} cy={nh.knee[1]} r={nh.r} fill={`url(#fur-${id})`} />
        <path d={nf.d} fill={`url(#fur-${id})`} />
        <circle cx={nf.knee[0]} cy={nf.knee[1]} r={nf.r} fill={`url(#fur-${id})`} />
        <ellipse cx={nh.paw[0]} cy={nh.paw[1]} rx="10" ry="5.5" fill="#B47A2C" />
        <ellipse cx={nf.paw[0]} cy={nf.paw[1]} rx="10" ry="5.5" fill="#B47A2C" />
      </g>
    </svg>
  )
}
