// Prueba de las exposiciones con evaluación entre pares (Fase 10) contra PostgreSQL local con las migraciones.
// Reglas de la "Copa Salvando el Semestre": 5 criterios × 3 niveles, explicar la nota, nadie se evalúa a sí mismo
// ni a su grupo, ausente = 0, cronómetro sin límite. Además: nota del docente con peso, paso a la libreta, PIN único.
// Uso: node tests/load/presentations-test.mjs
import pg from 'pg'

const TEACHER = '11111111-1111-1111-1111-111111111111'
const cfg = { host: '/tmp', port: 5544, user: 'postgres', database: 't' }
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
const err = async (c, fn, args) => {
  try {
    await rpc(c, fn, args)
    return ''
  } catch (e) {
    return e.message
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const admin = new pg.Client(cfg)
await admin.connect()
const host = await client('authenticated', TEACHER)
const anon = await client('anon')
if (!(await admin.query(`select 1 from public.subjects where code = 'DEMO 023'`)).rowCount) await rpc(host, 'seed_demo_data', [])
const { rows: [subj] } = await admin.query(`select id from public.subjects where code = 'DEMO 023' limit 1`)
const { rows: st } = await admin.query(
  `select s.id, s.university_code code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
    where e.subject_id = $1 order by s.university_code limit 7`, [subj.id])
const { rows: [item] } = await admin.query(
  `select gi.id from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id where gp.subject_id = $1 and gi.category = 'Exposiciones' and gi.term = 3`, [subj.id])
const { rows: [auto] } = await admin.query(
  `select gi.id from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id where gp.subject_id = $1 and gi.source = 'yaguarquiz' limit 1`, [subj.id])

const RUBRIC = {
  levels: [{ v: 1, emoji: '🆘', label: 'Pide rescate', hint: 'No suficiente' }, { v: 2, emoji: '🛟', label: 'Se salva', hint: 'Suficiente' }, { v: 3, emoji: '🏆', label: '¡Salvó el semestre!', hint: 'Excelente' }],
  criteria: ['Dominio del tema', 'Momento memorable', 'Caso real de Cobija', 'Claridad y tiempo', 'Responde preguntas'].map((title) => ({ title, question: '', icon: '⭐', levels: {} })),
}
console.log('▶ Crear la exposición')
check(/permission denied/.test(await err(anon, 'save_presentation', [JSON.stringify({})])), 'el estudiante no puede crear exposiciones')
// 6 expositores en 3 grupos (st[6] solo evalúa)
const presenters = st.slice(0, 6).map((s, i) => ({ student_id: s.id, group_no: Math.floor(i / 2) + 1, topic: `Tema ${i + 1}`, day: 1, sort_order: i + 1 }))
const pid = await rpc(host, 'save_presentation', [JSON.stringify({ subject_id: subj.id, title: 'Exposiciones Unidad 3', rubric: RUBRIC, settings: { teacher_weight: 50, require_ci: true }, presenters })])
check(!!pid, 'se crea con 6 expositores en 3 grupos')
check(/criterios/.test(await err(host, 'save_presentation', [JSON.stringify({ id: pid, subject_id: subj.id, title: 'x', rubric: { levels: RUBRIC.levels, criteria: [] } })])), 'valida la rúbrica')
let H = await rpc(host, 'presentation_host', [pid])
const pin = H.presentation.pin
check(/^\d{6}$/.test(pin) && H.presenters.length === 6, `PIN ${pin}`)

console.log('▶ Ingreso de los estudiantes (RU + CI)')
const info = await rpc(anon, 'presentation_info', [pin])
check(info.ok && info.kind === 'presentation' && info.require_ci, 'el PIN se reconoce como exposición y pide CI')
check((await rpc(anon, 'presentation_join', [pin, 'NO-EXISTE', '123', 'x'])).error === 'not_enrolled', 'RU no inscrito: rechazado')
check((await rpc(anon, 'presentation_join', [pin, st[0].code, '999', 'pc-0'])).error === 'bad_ci', 'CI incorrecto: rechazado')
const tok = []
for (const [i, s] of st.entries()) {
  const j = await rpc(anon, 'presentation_join', [pin, s.code.toLowerCase(), s.ci.slice(-3), `pc-${i}`])
  tok.push(j.token)
}
check(tok.every(Boolean), '7 estudiantes entran (RU en minúsculas también)')
check((await rpc(anon, 'presentation_join', [pin, st[0].code, st[0].ci.slice(-3), 'otra-pc'])).error === 'other_device', 'el mismo RU desde otra PC queda bloqueado')
check((await rpc(anon, 'presentation_join', [pin, st[0].code, st[0].ci.slice(-3), 'pc-0'])).rejoined === true, 'al recargar en la misma PC vuelve a entrar')

console.log('▶ En escena y evaluación')
const ids = H.presenters.map((p) => p.id)
const S = (n) => Array(5).fill(n)
const WHY = 'Explicó muy bien con su ejemplo'
const UND = 'Entendí que las redes se eligen según el público'
check((await rpc(anon, 'presentation_review', [tok[2], ids[0], S(3), WHY, UND])).error === 'closed', 'antes de abrir no se puede evaluar')
await rpc(host, 'presentation_control', [pid, 'next', null, null])
H = await rpc(host, 'presentation_host', [pid])
check(H.presentation.current_presenter === ids[0] && H.presenters[0].state === 'live' && H.presentation.status === 'open', '«Siguiente expositor»: el primero pasa a escena y la sala se abre')
let S2 = await rpc(anon, 'presentation_state', [tok[2]])
check(S2.current?.id === ids[0] && !JSON.stringify(S2).includes(st[0].code), 'el celular ve quién expone (sin RU de los compañeros)')
check((await rpc(anon, 'presentation_review', [tok[0], ids[0], S(3), WHY, UND])).error === 'self', 'no se evalúa a sí mismo')
check((await rpc(anon, 'presentation_review', [tok[1], ids[0], S(3), WHY, UND])).error === 'own_group', 'no evalúa a su propio grupo')
check((await rpc(anon, 'presentation_review', [tok[2], ids[4], S(3), WHY, UND])).error === 'not_open', 'no evalúa a quien aún no expuso')
check((await rpc(anon, 'presentation_review', [tok[2], ids[0], S(3), 'corto', UND])).error === 'why', 'pide explicar el porqué (15 caracteres)')
check((await rpc(anon, 'presentation_review', [tok[2], ids[0], S(3), WHY, 'poco'])).error === 'understood', 'pide contar qué entendió (25 caracteres)')
check((await rpc(anon, 'presentation_review', [tok[2], ids[0], [3, 3, 3, 3], WHY, UND])).error === 'scores', 'debe calificar los 5 criterios')
check((await rpc(anon, 'presentation_review', [tok[2], ids[0], [3, 3, 3, 3, 7], WHY, UND])).error === 'scores', 'solo niveles válidos')
// evaluaciones: 3,3,3,2,2 = 13 → 86,67 · 2,2,2,2,2 = 10 → 66,67 · 3,3,3,3,3 = 15 → 100
check((await rpc(anon, 'presentation_review', [tok[2], ids[0], [3, 3, 3, 2, 2], WHY, UND])).score == 86.67, 'nota 13/15 = 86,67 (= 4,33 sobre 5)')
await rpc(anon, 'presentation_review', [tok[3], ids[0], S(2), WHY, UND])
await rpc(anon, 'presentation_review', [tok[6], ids[0], S(3), WHY, UND])
await rpc(anon, 'presentation_review', [tok[6], ids[0], S(2), WHY, UND]) // corrige su nota
await rpc(anon, 'presentation_review', [tok[6], ids[0], S(3), WHY, UND])
await sleep(1100)
await rpc(host, 'presentation_control', [pid, 'next', null, null])
H = await rpc(host, 'presentation_host', [pid])
const p0 = H.presenters[0]
check(p0.state === 'done' && p0.duration_sec >= 1 && H.presentation.current_presenter === ids[1], `al pasar al siguiente se guarda cuánto expuso (${p0.duration_sec} s)`)
check(p0.peer_n === 3 && Math.abs(p0.peer_avg - 84.45) < 0.01, `promedio de los compañeros (3 evaluaciones, corregir no duplica): ${p0.peer_avg}`)
check((await rpc(anon, 'presentation_review', [tok[4], ids[0], S(3), WHY, UND])).ok, 'se puede seguir evaluando a quien ya terminó')

console.log('▶ Nota del docente, ausente y nota final')
await rpc(host, 'presentation_teacher_score', [ids[0], S(3), 'Excelente apertura'])
H = await rpc(host, 'presentation_host', [pid])
const f0 = H.presenters[0]
check(f0.teacher === 100 && Math.abs(f0.final - (0.5 * 100 + 0.5 * f0.peer_avg)) < 0.02, `final = 50 % docente + 50 % compañeros = ${f0.final}`)
await rpc(host, 'presentation_control', [pid, 'absent', ids[2], null])
H = await rpc(host, 'presentation_host', [pid])
check(H.presenters[2].state === 'absent' && H.presenters[2].final == 0, 'ausente = 0')
check((await rpc(anon, 'presentation_review', [tok[0], ids[2], S(3), WHY, UND])).error === 'absent', 'no se evalúa a un ausente')
check(H.presenters[1].peer_n === 0 && H.presenters[1].final === null, 'sin evaluaciones todavía: nota pendiente')
await rpc(host, 'presentation_control', [pid, 'undo', ids[1], null])
H = await rpc(host, 'presentation_host', [pid])
check(H.presenters[1].state === 'pending' && !H.presentation.current_presenter, '«Deshacer»: vuelve a pendiente')
const det = await rpc(host, 'presentation_reviews_of', [ids[0]])
check(det.length === 4 && det.every((d) => d.why && d.understood), 'el docente lee el porqué y lo que entendió cada evaluador')
check(/permission denied/.test(await err(anon, 'presentation_host', [pid])), 'el estudiante no ve el panel del docente')
check(/permission denied/.test(await err(anon, '_pres_score', ['{3}', '{}'])), 'funciones internas protegidas')

console.log('▶ Libreta y PIN')
check(/manual/.test(await err(host, 'presentation_to_gradebook', [pid, auto.id])), 'solo pasa a una categoría manual (Exposiciones)')
const n = await rpc(host, 'presentation_to_gradebook', [pid, item.id])
const { rows: ms } = await admin.query('select student_id, score from public.manual_scores where grading_item_id = $1', [item.id])
check(n === 2 && ms.some((m) => m.student_id === st[0].id && Math.abs(Number(m.score) - f0.final) < 0.01) && ms.some((m) => m.student_id === st[2].id && Number(m.score) === 0),
  `pasa ${n} notas a la libreta (la del expositor y el ausente = 0)`)
const gb = await rpc(host, 'gradebook', [subj.id])
check(gb.manual.some((m) => m.item_id === item.id), 'la libreta las muestra en Exposiciones')
// una sesión nueva nunca recibe el mismo PIN que una exposición abierta
const { rows: [qz] } = await admin.query(`select id from public.quizzes where title like 'Repaso Unidad 1%' limit 1`)
await admin.query(`alter table public.sessions disable trigger activity_session_guard`)
const { rows: [sx] } = await admin.query(`insert into public.sessions (teacher_id, quiz_id, subject_id, pin, question_ids) values ($1, $2, $3, $4, '{}') returning pin`, [TEACHER, qz.id, subj.id, pin])
await admin.query(`alter table public.sessions enable trigger activity_session_guard`)
check(sx.pin !== pin, `una sesión con el mismo PIN recibe otro (${sx.pin})`)
await admin.query(`delete from public.sessions where pin = $1`, [sx.pin])
await rpc(host, 'presentation_control', [pid, 'close', null, null])
check((await rpc(anon, 'presentation_review', [tok[5], ids[0], S(3), WHY, UND])).error === 'closed', 'al cerrar ya no se puede evaluar')
check((await rpc(anon, 'presentation_info', [pin])).error === 'pin', 'el PIN de una exposición cerrada ya no sirve')
await rpc(host, 'presentation_control', [pid, 'clear_tests', null, null])
H = await rpc(host, 'presentation_host', [pid])
check(H.presenters.every((p) => p.state === 'pending' && p.peer_n === 0) && H.participants.length === 0, '«Borrar pruebas» deja todo en cero')

await Promise.all([admin.end(), host.end(), anon.end()])
console.log(failures ? `✖ ${failures} verificaciones fallaron` : '✓ Exposiciones: todo correcto')
process.exit(failures ? 1 : 0)
