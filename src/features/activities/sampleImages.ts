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

/** Correo de email marketing (cuarta versión del mapa). Partes del correo según el material del Grupo 5. 600×800. */
export const MAIL_SVG = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" font-family="Arial, Helvetica, sans-serif">
  <rect width="600" height="800" fill="#eef1f5"/>
  <rect x="0" y="0" width="600" height="56" fill="#3c4a5c"/><text x="24" y="36" font-size="20" font-weight="700" fill="#fff">Bandeja de entrada</text>
  <rect x="12" y="68" width="576" height="96" rx="10" fill="#fff" stroke="#cfd6df"/>
  <circle cx="50" cy="104" r="20" fill="#e8590c"/><text x="50" y="111" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">PR</text>
  <text x="84" y="98" font-size="19" font-weight="700" fill="#111">Panadería Río Acre</text><text x="540" y="98" font-size="15" fill="#666" text-anchor="end">9:05</text>
  <text x="84" y="124" font-size="18" font-weight="700" fill="#222">Tu pan favorito, ahora a domicilio</text>
  <text x="84" y="150" font-size="16" fill="#666">Pide antes de las 8 y recíbelo calientito en casa…</text>
  <rect x="12" y="180" width="576" height="608" rx="10" fill="#fff" stroke="#cfd6df"/>
  <rect x="40" y="204" width="520" height="210" rx="8" fill="#ffe8cc"/>
  <ellipse cx="300" cy="330" rx="150" ry="52" fill="#d9480f"/><ellipse cx="300" cy="318" rx="130" ry="40" fill="#f08c00"/>
  <path d="M200 318 q100 -40 200 0" stroke="#ffd8a8" stroke-width="6" fill="none"/>
  <text x="300" y="252" font-size="24" font-weight="700" fill="#a63e00" text-anchor="middle">Pan recién horneado</text>
  <text x="40" y="452" font-size="18" fill="#222">Hola, Ana:</text>
  <text x="40" y="482" font-size="18" fill="#222">Ahora puedes pedir tu pan por WhatsApp hasta las 8 de la</text>
  <text x="40" y="506" font-size="18" fill="#222">mañana y te lo llevamos calientito a tu casa.</text>
  <rect x="190" y="530" width="220" height="52" rx="26" fill="#e8590c"/><text x="300" y="563" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">Ver catálogo</text>
  <circle cx="262" cy="624" r="16" fill="#1877f2"/><text x="262" y="630" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">f</text>
  <circle cx="300" cy="624" r="16" fill="#c13584"/><rect x="292" y="616" width="16" height="16" rx="5" fill="none" stroke="#fff" stroke-width="2"/>
  <circle cx="338" cy="624" r="16" fill="#25d366"/><text x="338" y="630" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">W</text>
  <line x1="40" y1="660" x2="560" y2="660" stroke="#dde2e8"/>
  <text x="300" y="692" font-size="15" fill="#555" text-anchor="middle">Panadería Río Acre · Av. 9 de Febrero, Cobija · 700-00000</text>
  <text x="300" y="740" font-size="15" fill="#1971c2" text-anchor="middle" text-decoration="underline">Darse de baja de estos correos</text>
</svg>`)

export const MAIL_POINTS: { term: string; prompt: string; x: number; y: number }[] = [
  { term: 'Remitente', prompt: 'Nombre reconocible del negocio que envía', x: 34, y: 12.2 },
  { term: 'Asunto', prompt: 'Corto, claro y que despierte interés', x: 46, y: 15.5 },
  { term: 'Texto de vista previa', prompt: 'La línea que se lee junto al asunto', x: 60, y: 18.8 },
  { term: 'Imagen', prompt: 'Liviana, acompaña la idea principal', x: 50, y: 40 },
  { term: 'Cuerpo del mensaje', prompt: 'Mensaje breve con una idea principal', x: 50, y: 61.5 },
  { term: 'Llamado a la acción', prompt: 'Botón claro, como «Ver catálogo»', x: 50, y: 69.8 },
  { term: 'Íconos de redes sociales', prompt: 'Bloque para seguir al negocio en sus redes', x: 50, y: 78 },
  { term: 'Datos del negocio', prompt: 'En el pie: dirección y contacto', x: 50, y: 86.3 },
  { term: 'Enlace para darse de baja', prompt: 'Los proveedores exigen que sea fácil', x: 50, y: 92.3 },
]

/** Perfil de Empresa en Google (quinta versión del mapa). Elementos del Grupo 6. 600×800. */
export const GBP_SVG = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" font-family="Arial, Helvetica, sans-serif">
  <rect width="600" height="800" fill="#fff"/>
  <rect x="0" y="0" width="600" height="190" fill="#d3f9d8"/>
  <path d="M0 120 C120 80 200 160 320 110 S520 60 600 100 L600 190 L0 190 Z" fill="#b2f2bb"/>
  <line x1="0" y1="150" x2="600" y2="70" stroke="#fff" stroke-width="10"/><line x1="200" y1="0" x2="260" y2="190" stroke="#fff" stroke-width="8"/>
  <path d="M300 60 c-22 0 -36 16 -36 34 c0 26 36 58 36 58 s36 -32 36 -58 c0 -18 -14 -34 -36 -34z" fill="#e03131"/><circle cx="300" cy="94" r="12" fill="#fff"/>
  <text x="24" y="232" font-size="26" font-weight="700" fill="#202124">Librería Bahía</text>
  <text x="24" y="264" font-size="18" fill="#202124">4,6</text>
  <g fill="#fbbc04"><path d="M66 250 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z"/><path d="M90 250 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z"/><path d="M114 250 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z"/><path d="M138 250 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z"/><path d="M162 250 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z"/></g>
  <text x="186" y="264" font-size="17" fill="#5f6368">(87 reseñas)</text>
  <text x="24" y="294" font-size="17" fill="#5f6368">Librería · Papelería</text>
  <line x1="0" y1="316" x2="600" y2="316" stroke="#e8eaed" stroke-width="2"/>
  <circle cx="44" cy="350" r="10" fill="none" stroke="#1a73e8" stroke-width="3"/><text x="70" y="356" font-size="17" fill="#202124">Calle Cochabamba 123, Cobija, Pando</text>
  <circle cx="44" cy="392" r="10" fill="none" stroke="#1a73e8" stroke-width="3"/><line x1="44" y1="392" x2="44" y2="385" stroke="#1a73e8" stroke-width="2"/><line x1="44" y1="392" x2="49" y2="392" stroke="#1a73e8" stroke-width="2"/>
  <text x="70" y="398" font-size="17" fill="#188038">Abierto</text><text x="142" y="398" font-size="17" fill="#202124">· Cierra a las 20:00</text>
  <rect x="34" y="420" width="20" height="20" rx="4" fill="none" stroke="#1a73e8" stroke-width="3"/><text x="70" y="437" font-size="17" fill="#202124">700-00000 · WhatsApp</text>
  <circle cx="44" cy="470" r="10" fill="none" stroke="#1a73e8" stroke-width="3"/><line x1="34" y1="470" x2="54" y2="470" stroke="#1a73e8" stroke-width="2"/>
  <text x="70" y="476" font-size="17" fill="#1a0dab">facebook.com/libreriabahia.ejemplo</text>
  <line x1="0" y1="500" x2="600" y2="500" stroke="#e8eaed" stroke-width="2"/>
  <text x="24" y="534" font-size="19" font-weight="700" fill="#202124">Fotos</text>
  <rect x="24" y="548" width="170" height="110" rx="8" fill="#a5d8ff"/><rect x="40" y="574" width="60" height="70" fill="#1971c2"/><rect x="110" y="590" width="70" height="54" fill="#74c0fc"/>
  <rect x="210" y="548" width="170" height="110" rx="8" fill="#ffec99"/><rect x="230" y="568" width="22" height="80" fill="#e67700"/><rect x="258" y="568" width="22" height="80" fill="#2b8a3e"/><rect x="286" y="568" width="22" height="80" fill="#c92a2a"/>
  <rect x="396" y="548" width="170" height="110" rx="8" fill="#e5dbff"/><circle cx="450" cy="600" r="22" fill="#7048e8"/><circle cx="510" cy="600" r="22" fill="#9775fa"/>
  <text x="24" y="696" font-size="19" font-weight="700" fill="#202124">Reseñas</text>
  <text x="24" y="726" font-size="16" fill="#202124">«Encontré todos los útiles de mi hijo. Muy buena atención.»</text>
  <rect x="40" y="740" width="536" height="46" rx="6" fill="#f1f3f4"/>
  <text x="54" y="769" font-size="15" fill="#3c4043"><tspan font-weight="700">Respuesta del propietario:</tspan> ¡Gracias, Carla! Te esperamos.</text>
</svg>`)

export const GBP_POINTS: { term: string; prompt: string; x: number; y: number }[] = [
  { term: 'Nombre del negocio', prompt: 'Real, sin palabras de relleno', x: 22, y: 28.5 },
  { term: 'Calificación con estrellas', prompt: 'Suma prominencia en el ranking local', x: 20, y: 32.5 },
  { term: 'Categoría', prompt: 'La principal y correcta del rubro', x: 22, y: 36.5 },
  { term: 'Dirección', prompt: 'Exacta y ubicada en el mapa', x: 45, y: 44 },
  { term: 'Horario', prompt: 'Actualizado, incluidos feriados', x: 38, y: 49.2 },
  { term: 'Teléfono o WhatsApp', prompt: 'Para que llamen o escriban', x: 33, y: 54.2 },
  { term: 'Enlace a las redes', prompt: 'Lleva al sitio o a las redes del negocio', x: 48, y: 59 },
  { term: 'Fotos', prompt: 'Reales del local y de los productos', x: 50, y: 75.5 },
  { term: 'Respuesta del propietario', prompt: 'Las reseñas se responden', x: 50, y: 95.5 },
]

/** Página de resultados de Google (sexta versión del mapa). Elementos del Grupo 6, apartado 1.5. 600×800. */
export const SERP_SVG = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" font-family="Arial, Helvetica, sans-serif">
  <rect width="600" height="800" fill="#fff"/>
  <rect x="20" y="18" width="560" height="50" rx="25" fill="#fff" stroke="#dadce0" stroke-width="2"/>
  <circle cx="52" cy="43" r="9" fill="none" stroke="#5f6368" stroke-width="3"/><line x1="58" y1="49" x2="66" y2="57" stroke="#5f6368" stroke-width="3"/>
  <text x="84" y="50" font-size="19" fill="#202124">farmacia en Cobija</text>
  <rect x="20" y="84" width="560" height="120" rx="14" fill="#f3f0ff"/>
  <text x="38" y="114" font-size="16" font-weight="700" fill="#5f3dc4">✦ Vista creada con IA</text>
  <text x="38" y="142" font-size="15" fill="#3c4043">En Cobija hay varias farmacias en el centro; algunas atienden</text>
  <text x="38" y="164" font-size="15" fill="#3c4043">las 24 horas. Revisa su horario y sus reseñas antes de ir.</text>
  <text x="38" y="190" font-size="14" fill="#1a0dab">Fuentes: 3 sitios</text>
  <text x="24" y="236" font-size="14" font-weight="700" fill="#202124">Patrocinado</text>
  <text x="24" y="260" font-size="14" fill="#4d5156">www.farmaciasalud.ejemplo</text>
  <text x="24" y="284" font-size="19" fill="#1a0dab">Farmacia Salud · Envío a domicilio en Cobija</text>
  <rect x="20" y="304" width="560" height="214" rx="12" fill="#fff" stroke="#dadce0"/>
  <rect x="20" y="304" width="560" height="80" rx="12" fill="#e9f5e9"/><path d="M20 360 C150 320 300 380 580 330" stroke="#fff" stroke-width="8" fill="none"/>
  <circle cx="160" cy="340" r="9" fill="#e03131"/><circle cx="300" cy="352" r="9" fill="#e03131"/><circle cx="430" cy="334" r="9" fill="#e03131"/>
  <text x="36" y="412" font-size="16" font-weight="700" fill="#202124">Farmacia Central</text><text x="400" y="412" font-size="15" fill="#5f6368">4,5 ★★★★★ (64)</text>
  <text x="36" y="436" font-size="14" fill="#188038">Abierto las 24 horas</text>
  <text x="36" y="468" font-size="16" font-weight="700" fill="#202124">Farmacia Pando</text><text x="400" y="468" font-size="15" fill="#5f6368">4,2 ★★★★ (31)</text>
  <text x="36" y="492" font-size="14" fill="#5f6368">Cierra a las 22:00</text>
  <text x="24" y="552" font-size="14" fill="#4d5156">www.guiacobija.ejemplo › farmacias</text>
  <text x="24" y="578" font-size="19" fill="#1a0dab">Farmacias en Cobija: direcciones y horarios</text>
  <text x="24" y="602" font-size="15" fill="#4d5156">Lista de farmacias del centro de Cobija con su dirección,</text>
  <text x="24" y="622" font-size="15" fill="#4d5156">teléfono y horario de atención actualizado.</text>
  <text x="24" y="664" font-size="18" font-weight="700" fill="#202124">Otras preguntas de los usuarios</text>
  <rect x="20" y="676" width="560" height="44" rx="6" fill="#fff" stroke="#dadce0"/><text x="36" y="704" font-size="16" fill="#202124">¿Qué farmacia atiende de noche en Cobija?</text><text x="556" y="704" font-size="16" fill="#5f6368">⌄</text>
  <rect x="20" y="726" width="560" height="44" rx="6" fill="#fff" stroke="#dadce0"/><text x="36" y="754" font-size="16" fill="#202124">¿Hay farmacias con envío a domicilio?</text><text x="556" y="754" font-size="16" fill="#5f6368">⌄</text>
</svg>`)

export const SERP_POINTS: { term: string; prompt: string; x: number; y: number }[] = [
  { term: 'Búsqueda local', prompt: 'Lo que escribió la persona: quiere algo cerca', x: 40, y: 5.4 },
  { term: 'Resumen creado con IA', prompt: 'Respuesta de la IA de Google con algunas fuentes', x: 50, y: 18.5 },
  { term: 'Anuncio patrocinado', prompt: 'Resultado pagado', x: 45, y: 33 },
  { term: 'Paquete local', prompt: 'Mapa con negocios cercanos', x: 50, y: 43 },
  { term: 'Calificación con estrellas', prompt: 'Estrellas de un negocio del mapa', x: 80, y: 51.5 },
  { term: 'Horario', prompt: 'Dato del negocio en el paquete local', x: 20, y: 54.5 },
  { term: 'Resultado orgánico', prompt: 'No se paga: Google lo ordena por relevancia y calidad', x: 50, y: 72.2 },
  { term: 'Meta descripción', prompt: 'Resumen de la página bajo el título', x: 50, y: 76.5 },
  { term: 'Otras preguntas de los usuarios', prompt: 'Preguntas relacionadas que se despliegan', x: 50, y: 88 },
]
