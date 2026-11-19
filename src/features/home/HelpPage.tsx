import { ArrowLeft, ClipboardCheck, Gamepad2, LifeBuoy, LogIn, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatedBackground } from '../../components/AnimatedBackground'
import { Shape } from '../../components/Shape'
import { TopBar } from '../../components/TopBar'
import { SolidCard } from '../../components/ui/Card'
import { JAGUAR } from '../../components/jaguar/assets'
import { ANSWER_STYLES } from '../../lib/brand'

/** Manual corto del estudiante (el mismo contenido que docs/MANUAL_ESTUDIANTE.md). */
export function HelpPage() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AnimatedBackground variant="calm" />
      <TopBar />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <img src={JAGUAR.manchas} alt="" aria-hidden className="absolute -inset-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] max-w-none animate-[spin_60s_linear_infinite] opacity-40" />
            <img src={JAGUAR.rostroAcuarela} alt="Jaguar en acuarela" className="relative w-24 drop-shadow-lg sm:w-28" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-black sm:text-4xl">¿Cómo se juega?</h1>
            <p className="text-ink-soft">Manual del estudiante · sin cuenta y sin instalar nada</p>
          </div>
        </div>

        <Section icon={<LogIn className="size-5" />} title="1. Entrar">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Abre esta página o escanea el <b>código QR</b> del proyector.
            </li>
            <li>
              Escribe el <b>PIN de 6 números</b> que ves en el proyector y toca <b>Entrar</b>.
            </li>
            <li>
              Escribe tu <b>RU</b> (registro universitario) y, si te lo piden, los <b>últimos 3 dígitos de tu CI</b>.
            </li>
            <li>
              Confirma tu nombre (<b>«Sí, soy yo»</b>), elige tu <b>avatar</b> y toca <b>¡Entrar al juego!</b>
            </li>
          </ol>
          <p className="mt-2 text-sm text-ink-soft">En los repasos puede pedirse solo un apodo: usa uno respetuoso (los insultos se bloquean).</p>
        </Section>

        <Section icon={<Gamepad2 className="size-5" />} title="2. Juego en vivo">
          <p>Cada respuesta tiene un color y una forma. En la PC puedes responder con las teclas 1, 2, 3 y 4:</p>
          <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ANSWER_STYLES.map((s) => (
              <span key={s.key} className={`flex items-center gap-2 rounded-2xl px-3 py-2 font-display text-xl font-bold ${s.bg} ${s.text}`}>
                <Shape shape={s.shape} className="size-5" /> {s.label} <kbd className="ml-auto rounded bg-black/15 px-1.5 text-sm">{s.key}</kbd>
              </span>
            ))}
          </div>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Verás <b>«¡Respuesta enviada!»</b>; el resultado aparece cuando termina la pregunta (así nadie se pasa las respuestas).
            </li>
            <li>
              <b>Puntos:</b> más rápido = más puntos, y tu <b>racha</b> 🔥 suma extra. La <b>nota (0–100) depende solo de tus aciertos</b>.
            </li>
            <li>Al final: tu puesto, aciertos, nota e insignias (🥇 Campeón · 💯 Perfecto · 🔥 Racha · ⚡ El más rápido).</li>
          </ul>
        </Section>

        <Section icon={<ClipboardCheck className="size-5" />} title="3. Examen de laboratorio o tarea">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Toca <b>Comenzar</b>: desde ese momento corre tu <b>tiempo total</b>. Avanza con <b>Siguiente</b> y <b>Anterior</b>; cada
              respuesta se guarda sola.
            </li>
            <li>
              Al terminar toca <b>Entregar</b>. Si se acaba el tiempo o cierra la actividad, <b>se entrega solo</b> lo que respondiste.
            </li>
            <li>
              <b>Modo enfoque:</b> puede pedir pantalla completa; salir de la pestaña queda registrado y el examen puede bloquearse hasta
              que el docente lo habilite.
            </li>
            <li>No se puede copiar ni pegar, y cada estudiante recibe las preguntas y opciones en distinto orden.</li>
          </ul>
        </Section>

        <Section icon={<Gamepad2 className="size-5" />} title="Actividades: crucigrama, sopa de letras, memoria…">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Entras como a una tarea (PIN y RU) y tocas <b>Comenzar</b>. Cada palabra se corrige <b>al instante</b>; si fallas, te quedan más
              intentos (el primero vale 100 %, el segundo 60 %).
            </li>
            <li>Tu avance se guarda solo: si recargas, sigues donde te quedaste.</li>
            <li>
              Al resolver todo <b>se entrega sola</b>. Si no terminas, toca <b>Entregar</b>: lo que falta cuenta como 0.
            </li>
            <li>
              Crucigrama: <b>Enter</b> comprueba y <b>Tab</b> pasa a la siguiente. Sopa de letras: arrastra de la primera a la última letra, o
              tócalas una tras otra.
            </li>
          </ul>
        </Section>

        <Section icon={<LifeBuoy className="size-5" />} title="4. Si algo falla">
          <dl className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <Faq q="Se cortó el internet o se cerró la pestaña">
              Vuelve a abrir la página: entras solo donde estabas, con tu puntaje. En examen, tus respuestas se guardan en el equipo y se
              envían al volver la conexión.
            </Faq>
            <Faq q="«No encontramos ese PIN»">Revisa los 6 números en el proyector.</Faq>
            <Faq q="«Ese RU no está inscrito»">Revisa tu RU; si está bien, avisa al docente.</Faq>
            <Faq q="«Ya está jugando en otro dispositivo»">Avisa al docente: él autoriza el cambio de equipo.</Faq>
            <Faq q="La hora de mi PC está mal">No importa: el tiempo lo mide el servidor.</Faq>
            <Faq q="No se escucha nada">Toca la pantalla una vez o revisa el botón de sonido. En clase la música suena en el proyector.</Faq>
          </dl>
        </Section>

        <Section icon={<ShieldCheck className="size-5" />} title="5. Respeto y honestidad">
          <p>
            Responde por ti mismo. El sistema registra salidas de la pestaña, intentos de pegar texto y cambios de equipo, y el docente
            los ve en su reporte. <b>¡Demuestra tu garra!</b> 🐆
          </p>
        </Section>

        <Link to="/" className="mx-auto flex items-center gap-2 rounded-2xl bg-uap-blue px-5 py-3 font-display font-bold text-white shadow-lg">
          <ArrowLeft className="size-5" /> Ir a ingresar el PIN
        </Link>
      </main>
    </div>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <SolidCard className="p-5 sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-extrabold">
        <span className="grid size-9 place-items-center rounded-xl bg-uap-gold/20 text-[#7a5a14] dark:text-uap-gold-300">{icon}</span>
        {title}
      </h2>
      <div className="leading-relaxed">{children}</div>
    </SolidCard>
  )
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-semibold">{q}</dt>
      <dd className="text-ink-soft">{children}</dd>
    </>
  )
}
