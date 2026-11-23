// Imágenes de ejemplo (SVG propio, sin derechos de terceros) para el mapa interactivo y el puzzle
const uri = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s{2,}/g, ' '))

/** Anuncio de una red social con sus partes (para «Mapa interactivo»). Puntos en % sobre 600×760. */
export const AD_SVG = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 760" font-family="Arial, Helvetica, sans-serif">
  <rect width="600" height="760" fill="#f0f2f5"/>
  <rect x="20" y="20" width="560" height="720" rx="18" fill="#fff" stroke="#dadde1" stroke-width="2"/>
  <circle cx="72" cy="72" r="30" fill="#C9A23A"/><circle cx="72" cy="72" r="22" fill="#8B1A1A"/>
  <text x="72" y="80" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">DR</text>
  <text x="116" y="66" font-size="22" font-weight="700" fill="#050505">Salteñería Doña Rosa</text>
  <text x="116" y="92" font-size="16" fill="#65676b">Publicidad · Cobija</text>
  <circle cx="540" cy="70" r="4" fill="#65676b"/><circle cx="526" cy="70" r="4" fill="#65676b"/><circle cx="554" cy="70" r="4" fill="#65676b"/>
  <text x="44" y="140" font-size="19" fill="#050505">¿Antojo de salteñas? Llevamos a tu casa en 30 min.</text>
  <text x="44" y="166" font-size="19" fill="#050505">Escríbenos y pide tu docena con 10 % de descuento.</text>
  <rect x="20" y="190" width="560" height="330" fill="#ffd8a8"/>
  <circle cx="460" cy="250" r="44" fill="#fff3bf"/>
  <ellipse cx="300" cy="420" rx="210" ry="40" fill="#e8590c" opacity=".25"/>
  <path d="M150 400 Q300 250 450 400 Z" fill="#f59f00" stroke="#d9480f" stroke-width="6"/>
  <path d="M170 392 Q300 300 430 392" fill="none" stroke="#fff3bf" stroke-width="8" stroke-dasharray="14 12"/>
  <text x="300" y="485" font-size="26" font-weight="700" fill="#8B1A1A" text-anchor="middle">Salteñas jugosas recién horneadas</text>
  <rect x="20" y="520" width="560" height="96" fill="#f0f2f5"/>
  <text x="44" y="556" font-size="15" fill="#65676b">DONAROSA.EJEMPLO</text>
  <text x="44" y="590" font-size="21" font-weight="700" fill="#050505">Docena con 10 % de descuento</text>
  <rect x="404" y="540" width="156" height="56" rx="10" fill="#1877f2"/>
  <text x="482" y="576" font-size="21" font-weight="700" fill="#fff" text-anchor="middle">Pedir ahora</text>
  <circle cx="52" cy="650" r="13" fill="#1877f2"/><circle cx="70" cy="650" r="13" fill="#f33e58"/>
  <text x="94" y="657" font-size="18" fill="#65676b">128</text>
  <text x="556" y="657" font-size="18" fill="#65676b" text-anchor="end">24 comentarios · 9 veces compartido</text>
  <line x1="40" y1="680" x2="560" y2="680" stroke="#dadde1" stroke-width="2"/>
  <text x="110" y="716" font-size="19" font-weight="700" fill="#65676b" text-anchor="middle">Me gusta</text>
  <text x="300" y="716" font-size="19" font-weight="700" fill="#65676b" text-anchor="middle">Comentar</text>
  <text x="490" y="716" font-size="19" font-weight="700" fill="#65676b" text-anchor="middle">Compartir</text>
</svg>`)

/** Puntos del anuncio (x, y en %), en el mismo orden que sus nombres */
export const AD_POINTS: { term: string; prompt: string; x: number; y: number }[] = [
  { term: 'Foto de perfil', prompt: 'Identifica a la marca', x: 12, y: 9.5 },
  { term: 'Nombre de la página', prompt: 'Quién publica', x: 46, y: 8.5 },
  { term: 'Etiqueta de publicidad', prompt: 'Indica que es un anuncio pagado', x: 27, y: 12.2 },
  { term: 'Copy', prompt: 'El texto persuasivo de arriba', x: 50, y: 20 },
  { term: 'Imagen del anuncio', prompt: 'Lo primero que atrapa la mirada', x: 50, y: 42 },
  { term: 'Título', prompt: 'La frase corta junto al botón', x: 34, y: 77.5 },
  { term: 'Llamado a la acción', prompt: 'El botón que invita a hacer algo', x: 80, y: 74 },
  { term: 'Reacciones', prompt: 'Me gusta y me encanta', x: 12, y: 85.5 },
  { term: 'Comentarios y compartidos', prompt: 'Lo que más mide la interacción', x: 74, y: 85.5 },
]

/** Embudo de ventas (premio del «Puzzle»): se descubre pieza a pieza */
export const FUNNEL_SVG = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="Arial, Helvetica, sans-serif">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1F3864"/><stop offset="1" stop-color="#0b1a33"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <text x="400" y="62" font-size="38" font-weight="700" fill="#C9A23A" text-anchor="middle">El embudo de ventas</text>
  <path d="M120 100 H680 L620 210 H180 Z" fill="#4dabf7"/><text x="400" y="167" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">1. ATRAER · alcance</text>
  <path d="M185 220 H615 L560 320 H240 Z" fill="#40c057"/><text x="400" y="281" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">2. INTERESAR · clics</text>
  <path d="M245 330 H555 L505 430 H295 Z" fill="#fab005"/><text x="400" y="391" font-size="26" font-weight="700" fill="#1F3864" text-anchor="middle">3. CONVERTIR · ventas</text>
  <path d="M300 440 H500 L460 540 H340 Z" fill="#e8590c"/><text x="400" y="500" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">4. FIDELIZAR</text>
  <text x="400" y="584" font-size="20" fill="#dee2e6" text-anchor="middle">Muchos conocen la marca · pocos compran · los fieles vuelven y recomiendan</text>
</svg>`)
