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

/** Publicación con publicidad en Instagram (segunda versión del mapa). Puntos en % sobre 600×800. */
export const IG_SVG = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" font-family="Arial, Helvetica, sans-serif">
  <rect width="600" height="800" fill="#fff"/>
  <circle cx="60" cy="58" r="30" fill="#f783ac"/><circle cx="60" cy="58" r="24" fill="#fff"/><circle cx="60" cy="58" r="21" fill="#c2255c"/>
  <text x="60" y="65" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">DA</text>
  <text x="104" y="54" font-size="21" font-weight="700" fill="#111">dulceamazonia.cbja</text>
  <text x="104" y="82" font-size="16" fill="#555">Publicidad</text>
  <circle cx="548" cy="58" r="4" fill="#111"/><circle cx="562" cy="58" r="4" fill="#111"/><circle cx="534" cy="58" r="4" fill="#111"/>
  <rect x="0" y="110" width="600" height="450" fill="#ffe3ec"/>
  <rect x="190" y="360" width="220" height="110" rx="12" fill="#a0522d"/><rect x="215" y="280" width="170" height="90" rx="12" fill="#f8c8d8"/>
  <rect x="235" y="215" width="130" height="75" rx="12" fill="#a0522d"/><rect x="292" y="170" width="16" height="45" fill="#ffd43b"/>
  <ellipse cx="300" cy="165" rx="9" ry="14" fill="#ff922b"/><ellipse cx="300" cy="490" rx="210" ry="22" fill="#e599b3"/>
  <text x="300" y="535" font-size="26" font-weight="700" fill="#a61e4d" text-anchor="middle">Tortas personalizadas en 24 horas</text>
  <rect x="0" y="560" width="600" height="52" fill="#f1f3f5"/>
  <text x="24" y="594" font-size="20" font-weight="700" fill="#1971c2">Enviar mensaje</text>
  <path d="M566 576 l10 10 l-10 10" stroke="#1971c2" stroke-width="4" fill="none"/>
  <path d="M50 660 c-14 -18 -36 -6 -24 12 l24 22 l24 -22 c12 -18 -10 -30 -24 -12 z" fill="none" stroke="#111" stroke-width="4"/>
  <path d="M104 648 a22 20 0 1 1 -6 30 l-12 6 l4 -12 a22 20 0 0 1 14 -24 z" fill="none" stroke="#111" stroke-width="4"/>
  <path d="M146 650 l44 -6 l-22 44 l-4 -20 z" fill="none" stroke="#111" stroke-width="4"/>
  <path d="M536 642 h28 v44 l-14 -12 l-14 12 z" fill="none" stroke="#111" stroke-width="4"/>
  <text x="24" y="725" font-size="19" font-weight="700" fill="#111">312 Me gusta</text>
  <text x="24" y="756" font-size="18" fill="#111"><tspan font-weight="700">dulceamazonia.cbja</tspan> Tu torta lista en 24 horas. Pide la tuya.</text>
  <text x="24" y="784" font-size="18" fill="#1864ab">#Cobija #Tortas #Pando</text>
</svg>`)

export const IG_POINTS: { term: string; prompt: string; x: number; y: number }[] = [
  { term: 'Foto de perfil', prompt: 'Identifica a la marca', x: 10, y: 7.3 },
  { term: 'Nombre de usuario', prompt: 'La cuenta que publica', x: 40, y: 6.5 },
  { term: 'Etiqueta de publicidad', prompt: 'Indica que es un anuncio pagado', x: 24, y: 10 },
  { term: 'Imagen del anuncio', prompt: 'Lo primero que atrapa la mirada', x: 50, y: 40 },
  { term: 'Llamado a la acción', prompt: 'La barra que invita a escribir', x: 22, y: 74 },
  { term: 'Me gusta', prompt: 'El corazón', x: 8.3, y: 83.5 },
  { term: 'Guardar', prompt: 'Para volver a verlo después', x: 91.7, y: 83 },
  { term: 'Copy', prompt: 'El texto debajo de la imagen', x: 62, y: 94.2 },
  { term: 'Hashtags', prompt: 'Palabras con #', x: 30, y: 98 },
]

/** Anuncio en los resultados de búsqueda de Google (tercera versión del mapa). Puntos en % sobre 600×600. */
export const GADS_SVG = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" font-family="Arial, Helvetica, sans-serif">
  <rect width="600" height="600" fill="#fff"/>
  <rect x="24" y="22" width="552" height="52" rx="26" fill="#fff" stroke="#dadce0" stroke-width="2"/>
  <circle cx="58" cy="47" r="10" fill="none" stroke="#5f6368" stroke-width="3"/><line x1="65" y1="54" x2="74" y2="63" stroke="#5f6368" stroke-width="3"/>
  <text x="90" y="55" font-size="20" fill="#202124">paseos en bote Cobija</text>
  <text x="30" y="118" font-size="16" font-weight="700" fill="#202124">Patrocinado</text>
  <circle cx="44" cy="150" r="14" fill="#2b8a3e"/><text x="44" y="156" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">AT</text>
  <text x="68" y="146" font-size="17" fill="#202124">Amazonía Tours</text>
  <text x="68" y="168" font-size="15" fill="#4d5156">www.amazoniatours.ejemplo › paseos</text>
  <text x="30" y="212" font-size="23" fill="#1a0dab">Paseos en bote por el río Acre | Reserva hoy</text>
  <text x="30" y="244" font-size="16" fill="#4d5156">Salidas cada domingo con almuerzo incluido. 10 % de descuento</text>
  <text x="30" y="266" font-size="16" fill="#4d5156">para grupos. Guías locales y chaleco salvavidas.</text>
  <text x="30" y="306" font-size="17" fill="#1a0dab">Precios</text><text x="120" y="306" font-size="17" fill="#1a0dab">Tour de un día</text><text x="270" y="306" font-size="17" fill="#1a0dab">Galería de fotos</text>
  <rect x="30" y="326" width="150" height="34" rx="17" fill="#e8f0fe"/><text x="105" y="349" font-size="16" fill="#1a0dab" text-anchor="middle">Llamar ahora</text>
  <text x="30" y="392" font-size="15" fill="#4d5156">Av. 9 de Febrero, Cobija · Abierto ahora</text>
  <line x1="24" y1="420" x2="576" y2="420" stroke="#dadce0" stroke-width="2"/>
  <text x="30" y="456" font-size="15" fill="#4d5156">www.turismopando.ejemplo › guia</text>
  <text x="30" y="486" font-size="22" fill="#1a0dab">Qué hacer en Cobija: guía de paseos y lugares</text>
  <text x="30" y="514" font-size="16" fill="#4d5156">Los mejores paseos por la Amazonía, precios y consejos para</text>
  <text x="30" y="536" font-size="16" fill="#4d5156">visitar Pando en cualquier época del año.</text>
</svg>`)

export const GADS_POINTS: { term: string; prompt: string; x: number; y: number }[] = [
  { term: 'Palabra clave buscada', prompt: 'Lo que escribió la persona', x: 40, y: 8 },
  { term: 'Etiqueta Patrocinado', prompt: 'Indica que es un anuncio pagado', x: 12, y: 18.8 },
  { term: 'Nombre del sitio', prompt: 'Quién anuncia', x: 24, y: 24.2 },
  { term: 'URL visible', prompt: 'La dirección de la página', x: 50, y: 28 },
  { term: 'Título del anuncio', prompt: 'La línea azul grande', x: 78, y: 35.3 },
  { term: 'Descripción', prompt: 'El texto gris que explica la oferta', x: 50, y: 42.3 },
  { term: 'Extensiones de enlace', prompt: 'Enlaces extra a otras páginas del sitio', x: 30, y: 50.5 },
  { term: 'Extensión de llamada', prompt: 'Botón para llamar al negocio', x: 17.5, y: 57 },
  { term: 'Resultado orgánico', prompt: 'El que no se paga', x: 50, y: 81 },
]
