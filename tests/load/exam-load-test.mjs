// Prueba del modo examen/tarea contra un PostgreSQL local con las migraciones aplicadas.
// Escala reducida del criterio de la Fase 5 ("un examen de 10 min se abre y se cierra solo; al cerrarse
// se entregan las respuestas pendientes"): examen de 30 s dentro de una ventana de 1 min, 45 estudiantes.
// Uso: node tests/load/exam-load-test.mjs [N=45]
import pg from 'pg'

const N = Number(process.argv[2] ?? 45)
const TEACHER = '11111111-1111-1111-1111-111111111111'
const cfg = { host: '/tmp', port: 5544, user: 'postgres', database: 't' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (cond, msg) => {
  if (!cond) failures++
  console.log(cond ? '  ✓' : '  ✖', msg)
}
async function client(role, sub = '') {
  const c = new pg.Client(cfg)
  await c.connect()
  await c.query(`set role ${role}`)
  await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub])
  return c
}
const rpc = async (c, fn, args) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) as r`, args)).rows[0].r
const until = async (t) => {
  const ms = t - Date.now()
  if (ms > 0) await sleep(ms)
}

// ------------------------------------------------------------------ preparación
const admin = new pg.Client(cfg)
await admin.connect()
const host = await client('authenticated', TEACHER)
if (!(await admin.query(`select 1 from public.subjects where code = 'DEMO 023'`)).rowCount) await rpc(host, 'seed_demo_data', [])
const { rows: [quiz] } = await admin.query(`select id, subject_id from public.quizzes where title like 'Repaso Unidad 1%' limit 1`)
await admin.query(`delete from public.sessions where quiz_id = $1`, [quiz.id])
// 45 estudiantes inscritos (EX-001 … EX-045, CI terminado en el mismo número)
await admin.query(`delete from public.students where university_code like 'EX-%'`)
await admin.query(
  `with s as (insert into public.students (teacher_id, university_code, ci, last_names, first_names)
              select $1, 'EX-' || lpad(i::text, 3, '0'), '7000' || lpad(i::text, 3, '0'), 'Examen', 'Estudiante ' || i
                from generate_series(1, $2) i returning id)
   insert into public.enrollments (teacher_id, student_id, subject_id) select $1, id, $3 from s`,
  [TEACHER, N, quiz.subject_id],
)
const { rows: keyRows } = await admin.query(
  `select q.id, q.type, q.base_points, q.accepted_answers,
          coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'c', o.is_correct, 'pos', o.correct_position) order by o.sort_order)
                   filter (where o.id is not null), '[]') as opts
     from public.questions q left join public.question_options o on o.question_id = q.id
    where q.quiz_id = $1 group by q.id`, [quiz.id])
const KEY = new Map(keyRows.map((r) => [r.id, r]))
const response = (qid, good) => {
  const k = KEY.get(qid)
  if (['single', 'true_false', 'image_choice'].includes(k.type)) return { kind: 'choice', key: (k.opts.find((o) => o.c === good) ?? k.opts[0]).id }
  if (k.type === 'multiple') return { kind: 'choices', keys: k.opts.filter((o) => o.c === good).map((o) => o.id) }
  if (k.type === 'short_text') return { kind: 'text', text: good ? k.accepted_answers[0].toUpperCase() : 'no sé' }
  const ord = [...k.opts].sort((a, b) => a.pos - b.pos).map((o) => o.id)
  return { kind: 'order', keys: good ? ord : [...ord].reverse() }
}
const leak = (state) => /is_correct|correct_keys|correct_order|accepted_answers|correct_position/.test(JSON.stringify(state.current ?? {}))

// ------------------------------------------------------------------ examen programado
console.log(`\n▶ Examen programado: abre en 3 s, 30 s por estudiante, cierra a los 60 s, ${N} estudiantes`)
const t0 = Date.now()
const opensAt = new Date(t0 + 3000)
const closesAt = new Date(t0 + 63000)
const ex = await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({
  mode: 'exam', identification: 'roster', require_ci: true, opens_at: opensAt.toISOString(), closes_at: closesAt.toISOString(),
  time_limit_min: 0.5, max_attempts: 1, pick_count: 4, shuffle_questions: true, shuffle_options: true,
  show_correct: 'after_close', show_grade: true, focus_mode: true, lock_after: 3,
})])
check(ex.mode === 'exam', `examen creado con PIN ${ex.pin}`)
let bad = null
try {
  await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({ mode: 'exam', identification: 'nickname' })])
} catch (e) {
  bad = e.message
}
check(bad?.includes('lista oficial'), 'un examen con apodos se rechaza (debe ser con RU)')

const studs = await Promise.all(Array.from({ length: N }, async (_, i) => ({ i, c: await client('anon'), code: `EX-${String(i + 1).padStart(3, '0')}`, ci: String(i + 1).padStart(3, '0') })))
const info0 = await rpc(studs[0].c, 'session_info', [ex.pin])
check(info0.ok && info0.window === 'not_open' && info0.question_count === 4, 'antes de la hora: la sala dice "todavía no abre" (4 preguntas, 30 s)')
const joins = await Promise.all(studs.map((s) => rpc(s.c, 'join_session', [ex.pin, s.code, s.ci, null, JSON.stringify({ animal: '🐆' }), `pc-${s.i}`])))
joins.forEach((j, i) => (studs[i].token = j.token))
check(joins.every((j) => j.ok), `${N} estudiantes se identifican antes de la apertura`)
check((await rpc(studs[0].c, 'start_attempt', [studs[0].token])).error === 'not_open', 'no se puede empezar antes de la hora')
check((await rpc(studs[0].c, 'join_session', [ex.pin, 'EX-001', '001', null, '{}', 'otra-pc'])).error === 'other_device', 'en examen el mismo RU desde otra PC queda bloqueado')

await until(opensAt.getTime() + 300)
const starts = await Promise.all(studs.map((s) => rpc(s.c, 'start_attempt', [s.token])))
check(starts.every((x) => x.ok && x.current?.questions?.length === 4), `a la hora exacta los ${N} empiezan a la vez (4 preguntas cada uno)`)
const dbl = await Promise.all([rpc(studs[2].c, 'start_attempt', [studs[2].token]), rpc((await client('anon')), 'start_attempt', [studs[2].token])])
check(dbl.every((x) => x.ok) && (await admin.query('select count(*)::int n from public.attempts where participant_id = (select id from public.participants where token = $1)', [studs[2].token])).rows[0].n === 1, 'doble clic en "Comenzar" crea un solo intento')
starts.forEach((st, i) => (studs[i].qs = st.current.questions.map((q) => q.id)))
check(!starts.some(leak), 'durante el examen ningún estudiante recibe las respuestas correctas')
const sets = new Set(studs.map((s) => [...s.qs].sort().join()))
const orders = new Set(studs.map((s) => s.qs.join()))
check(sets.size > 1 && orders.size > 5, `preguntas al azar y en distinto orden (${sets.size} combinaciones, ${orders.size} órdenes distintos)`)
const optOrders = new Set(starts.map((st) => JSON.stringify(st.current.questions.find((q) => q.type === 'single')?.options.map((o) => o.key) ?? null)))
check(optOrders.size > 1, 'las opciones también salen mezcladas por estudiante')

// Respuestas simultáneas: grupo A todo bien, B mitad bien, C contesta 2 y "se cae el internet", D cambia de opinión
const plan = (i) => (i % 4 === 0 ? 'A' : i % 4 === 1 ? 'B' : i % 4 === 2 ? 'C' : 'D')
await Promise.all(studs.map(async (s) => {
  const g = plan(s.i)
  for (const [j, qid] of s.qs.entries()) {
    if (g === 'C' && j >= 2) break
    const good = g === 'A' || g === 'C' || g === 'D' || (g === 'B' && j % 2 === 0)
    if (g === 'D') await rpc(s.c, 'save_answer', [s.token, qid, JSON.stringify(response(qid, false))])
    const r = await rpc(s.c, 'save_answer', [s.token, qid, JSON.stringify(response(qid, good))])
    if (!r.ok) console.log('    save error', s.code, r.error)
  }
}))
const { rows: [cnt] } = await admin.query('select count(*)::int n from public.answers a join public.attempts t on t.id = a.attempt_id where t.session_id = $1', [ex.id])
const expected = studs.reduce((n, s) => n + (plan(s.i) === 'C' ? 2 : 4), 0)
check(cnt.n === expected, `respuestas guardadas: ${cnt.n}/${expected} (cambiar de opinión no duplica)`)

// Modo enfoque: 3 salidas de pestaña bloquean
const s0 = studs[0]
for (let k = 0; k < 3; k++) await rpc(s0.c, 'report_event', [s0.token, 'tab'])
let st0 = await rpc(s0.c, 'exam_state', [s0.token])
check(st0.current.locked && st0.current.focus_losses === 3, 'tras 3 salidas de la pestaña el examen se bloquea')
check((await rpc(s0.c, 'save_answer', [s0.token, s0.qs[0], JSON.stringify(response(s0.qs[0], true))])).error === 'locked', 'bloqueado no puede responder')
let mon = await rpc(host, 'exam_monitor', [ex.id])
const row0 = mon.rows.find((r) => r.code === 'EX-001')
check(row0.current.locked && row0.focus_total === 3, 'el docente ve el bloqueo y las 3 salidas en el monitor')
await host.query('select public.exam_participant($1, $2, 0)', [row0.participant_id, 'unlock'])
check((await rpc(s0.c, 'save_answer', [s0.token, s0.qs[0], JSON.stringify(response(s0.qs[0], true))])).ok, 'el docente lo desbloquea y puede seguir')
await rpc(s0.c, 'report_event', [s0.token, 'paste'])

// 10 entregan antes de tiempo; ver revisión antes del cierre NO debe mostrar las correctas
const early = studs.filter((s) => plan(s.i) === 'A').slice(0, 5)
const subs = await Promise.all(early.map((s) => rpc(s.c, 'submit_attempt', [s.token])))
check(subs.every((x) => x.current === null && x.attempts.length === 1 && Number(x.attempts[0].grade) === 100), 'quien entrega con todo bien obtiene 100')
check(subs.every((x) => x.review === null), 'antes del cierre la revisión está oculta (no se pasan las respuestas)')
check((await rpc(early[0].c, 'start_attempt', [early[0].token])).error === 'no_attempts', 'con 1 intento no puede volver a empezar')

// Tiempo extra para EX-002 (+1 min) y EX-006 se le da un intento más
mon = await rpc(host, 'exam_monitor', [ex.id])
const r2 = mon.rows.find((r) => r.code === 'EX-002')
const r6 = mon.rows.find((r) => r.code === 'EX-006')
await host.query('select public.exam_participant($1, $2, 1)', [r2.participant_id, 'extra_time'])
check(mon.rows.filter((r) => r.current).length === N - 5 && mon.rows.filter((r) => !r.participant_id).length >= 0, `monitor: ${N - 5} en curso, 5 entregados`)

// ---------------------------------------------------------------- se acaba el tiempo (30 s + 10 s de gracia)
await until(opensAt.getTime() + 30000 + 11500)
const late = await rpc(studs[3].c, 'save_answer', [studs[3].token, studs[3].qs[0], JSON.stringify(response(studs[3].qs[0], true))])
check(!late.ok, `respuesta después del tiempo se rechaza (${late.error})`)
mon = await rpc(host, 'exam_monitor', [ex.id])
const inProg = mon.rows.filter((r) => r.current)
check(inProg.length === 1 && inProg[0].code === 'EX-002', 'al vencer los 30 s todos se entregaron solos, excepto quien tiene tiempo extra')
const { rows: rsn } = await admin.query(`select submit_reason, count(*)::int n from public.attempts where session_id = $1 group by 1 order by 1`, [ex.id])
console.log('    motivos de entrega:', rsn.map((r) => `${r.submit_reason ?? 'en curso'}=${r.n}`).join(', '))
check(rsn.find((r) => r.submit_reason === 'time')?.n === N - 6, 'entregados por tiempo con lo que alcanzaron a responder')
const grades = new Map(mon.rows.filter((r) => r.code).map((r) => [r.code, r.best_grade === null ? null : Number(r.best_grade)]))
const wrong = studs.filter((s) => s.i > 1).map((s) => [s.code, plan(s.i), grades.get(s.code)]).filter(([, g, v]) => ((g === 'A' || g === 'D') ? v !== 100 : !(v > 0 && v < 100)))
if (wrong.length) console.log('    notas inesperadas:', JSON.stringify(wrong.slice(0, 6)))
const groupOk = studs.filter((s) => s.i !== 1 && s.i !== 0).every((s) => {
  const g = grades.get(s.code)
  if (plan(s.i) === 'A' || plan(s.i) === 'D') return g === 100
  if (plan(s.i) === 'C') return g > 0 && g < 100
  return g > 0 && g < 100
})
check(groupOk, 'notas correctas: todo bien = 100; mitad bien o incompleto = nota parcial; cambiar de opinión cuenta la última respuesta')
const s1 = studs[1]
check((await rpc(s1.c, 'save_answer', [s1.token, s1.qs[2], JSON.stringify(response(s1.qs[2], true))])).ok, 'quien tiene tiempo extra todavía puede responder')

// Intento adicional autorizado por el docente
await host.query('select public.exam_participant($1, $2, 0)', [r6.participant_id, 'grant_attempt'])
const again = await rpc(studs[5].c, 'start_attempt', [studs[5].token])
check(again.ok && again.current?.number === 2, 'el docente autoriza un intento más y el estudiante empieza el intento 2')
await rpc(studs[5].c, 'save_answer', [studs[5].token, again.current.questions[0].id, JSON.stringify(response(again.current.questions[0].id, true))])

// ---------------------------------------------------------------- cierre automático de la actividad
await until(closesAt.getTime() + 11500)
const info1 = await rpc(studs[10].c, 'session_info', [ex.pin])
check(info1.error === 'finished', 'pasada la hora de cierre el PIN dice "terminó"')
const after = await rpc(studs[5].c, 'exam_state', [studs[5].token])
check(after.current === null && after.attempts.length === 2 && after.attempts[1].reason === 'closed', 'el intento en curso se entregó solo al cerrarse la actividad')
check(Number(after.best_grade) >= Number(after.attempts[0].grade), 'cuenta el mejor intento')
let ext = await rpc(s1.c, 'exam_state', [s1.token])
check(ext.current !== null && new Date(ext.current.deadline) > closesAt, 'el tiempo extra (necesidades especiales) se respeta aunque ya cerró para los demás')
mon = await rpc(host, 'exam_monitor', [ex.id])
await host.query('select public.exam_participant($1, $2, 0)', [mon.rows.find((r) => r.code === 'EX-002').participant_id, 'force_submit'])
ext = await rpc(s1.c, 'exam_state', [s1.token])
check(ext.current === null && ext.attempts[0].reason === 'teacher', '"Entregar ahora" del docente entrega su examen')
check(Array.isArray(after.review) && after.review.length > 0 && after.review[0].reveal, 'después del cierre cada estudiante puede revisar sus respuestas con las correctas')
check((await rpc(studs[44].c, 'join_session', [ex.pin, 'EX-045', '045', null, '{}', 'nueva-pc'])).error === 'other_device', 'después del cierre no se puede entrar desde otra PC')

// ---------------------------------------------------------------- tarea / práctica
console.log('\n▶ Tarea con retroalimentación inmediata y 3 intentos')
const hw = await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({
  mode: 'homework', identification: 'roster', closes_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  max_attempts: 3, show_correct: 'each', shuffle_questions: false,
})])
const h = await client('anon')
const hj = await rpc(h, 'join_session', [hw.pin, 'EX-010', null, null, '{}', 'celular'])
const hj2 = await rpc(h, 'join_session', [hw.pin, 'EX-010', null, null, '{}', 'pc-de-casa'])
check(hj.ok && hj2.ok && hj2.token === hj.token, 'en tarea puede seguir desde otro dispositivo (celular → PC de casa)')
const hs = await rpc(h, 'start_attempt', [hj.token])
const q1 = hs.current.questions[0].id
const fb = await rpc(h, 'save_answer', [hj.token, q1, JSON.stringify(response(q1, false))])
check(fb.ok && fb.correct === false && fb.reveal, 'práctica: al responder ve al instante si acertó y la correcta')
check((await rpc(h, 'save_answer', [hj.token, q1, JSON.stringify(response(q1, true))])).error === 'already', 'práctica: no puede cambiar la respuesta después de ver la correcta')
const hsub = await rpc(h, 'submit_attempt', [hj.token])
check(hsub.attempts_left === 2 && hsub.can_start && Array.isArray(hsub.review), 'le quedan 2 intentos y ve la revisión al entregar')

// ---------------------------------------------------------------- seguridad
const anon = await client('anon')
let denied = 0
for (const sql of [`select public.exam_monitor('${ex.id}')`, `select public.exam_control('${ex.id}', 'close_now', 0)`,
  `select public._finalize_attempt('${ex.id}', 'x')`, 'select * from public.attempts', 'select * from public.answers']) {
  try {
    await anon.query(sql)
  } catch {
    denied++
  }
}
check(denied === 5, 'un estudiante no puede usar el monitor, cerrar el examen ni leer intentos/respuestas')
const other = await client('authenticated', '22222222-2222-2222-2222-222222222222')
let deniedOther = false
try {
  await rpc(other, 'exam_monitor', [ex.id])
} catch {
  deniedOther = true
}
check(deniedOther, 'otro docente no puede ver el monitor')

// close_now manual
const ex2 = await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({ mode: 'exam', time_limit_min: 40 })])
const e2 = await client('anon')
const j2 = await rpc(e2, 'join_session', [ex2.pin, 'EX-020', null, null, '{}', 'x'])
const st2 = await rpc(e2, 'start_attempt', [j2.token])
await rpc(e2, 'save_answer', [j2.token, st2.current.questions[0].id, JSON.stringify(response(st2.current.questions[0].id, true))])
const m2 = await rpc(host, 'exam_control', [ex2.id, 'close_now', 0])
check(m2.session.window === 'closed' && m2.rows.find((r) => r.code === 'EX-020').current === null, '"Cerrar ahora" entrega a todos con lo que tenían respondido')

await Promise.all([admin, host, anon, other, h, e2, ...studs.map((s) => s.c)].map((c) => c.end().catch(() => null)))
console.log(failures ? `\n✖ ${failures} verificaciones fallaron` : '\n✔ Todas las verificaciones pasaron')
process.exit(failures ? 1 : 0)
