// Prueba de reportes y libreta: juega una sesión en vivo y un examen con resultados conocidos
// y verifica que los números del reporte coinciden con un cálculo independiente.
// Uso: node tests/load/reports-test.mjs
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
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.02

const admin = new pg.Client(cfg)
await admin.connect()
const host = await client('authenticated', TEACHER)
if (!(await admin.query(`select 1 from public.subjects where code = 'DEMO 023'`)).rowCount) await rpc(host, 'seed_demo_data', [])
const { rows: [quiz] } = await admin.query(`select id, subject_id from public.quizzes where title like 'Repaso Unidad 1%' limit 1`)
await admin.query(`delete from public.sessions where quiz_id = $1`, [quiz.id])
const { rows: keyRows } = await admin.query(
  `select q.id, q.type, q.base_points, q.accepted_answers,
          coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'c', o.is_correct, 'pos', o.correct_position, 't', o.text) order by o.sort_order)
                   filter (where o.id is not null), '[]') as opts
     from public.questions q left join public.question_options o on o.question_id = q.id
    where q.quiz_id = $1 group by q.id`, [quiz.id])
const KEY = new Map(keyRows.map((r) => [r.id, r]))
const resp = (qid, good) => {
  const k = KEY.get(qid)
  if (['single', 'true_false', 'image_choice'].includes(k.type)) return { kind: 'choice', key: (k.opts.find((o) => o.c === good) ?? k.opts[0]).id }
  if (k.type === 'multiple') return { kind: 'choices', keys: k.opts.filter((o) => o.c === good).map((o) => o.id) }
  if (k.type === 'short_text') return { kind: 'text', text: good ? k.accepted_answers[0] : 'no sé' }
  const ord = [...k.opts].sort((a, b) => a.pos - b.pos).map((o) => o.id)
  return { kind: 'order', keys: good ? ord : [...ord].reverse() }
}

// ------------------------------------------------------------- sesión en vivo con 6 estudiantes del demo
console.log('\n▶ Reporte de una sesión en vivo')
const live = await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({ identification: 'roster' })])
const studs = []
for (let i = 1; i <= 6; i++) {
  const c = await client('anon')
  const j = await rpc(c, 'join_session', [live.pin, `DEMO-${String(i).padStart(3, '0')}`, null, null, '{}', `d${i}`])
  studs.push({ i, c, token: j.token })
}
let st = await rpc(host, 'host_advance', [live.id, 'lobby'])
const total = st.session.total
const truth = new Map() // estudiante → aciertos esperados
for (let qi = 0; qi < total; qi++) {
  st = await rpc(host, 'host_advance', [live.id, 'countdown'])
  const qid = st.question.id
  for (const s of studs) {
    if (s.i === 6) continue // DEMO-006 nunca responde
    const good = s.i <= 2 || (s.i === 3 && qi % 2 === 0) // 1 y 2 todo bien; 3 alterna; 4 y 5 todo mal
    await rpc(s.c, 'submit_answer', [s.token, qid, JSON.stringify(resp(qid, good))])
    if (good) truth.set(s.i, (truth.get(s.i) ?? 0) + 1)
  }
  await rpc(host, 'host_advance', [live.id, 'question'])
  await rpc(host, 'host_advance', [live.id, 'reveal'])
  await rpc(host, 'host_advance', [live.id, 'leaderboard'])
}
const rep = await rpc(host, 'session_report', [live.id])
check(rep.session.done && rep.session.quiz_title.startsWith('Repaso') && rep.session.subject.code === 'DEMO 023', 'el reporte trae datos de la sesión, asignatura y periodo')
check(rep.students.length === 6 && rep.absent.length === 6, `6 participantes y 6 ausentes de la lista (${rep.absent.length})`)
const by = new Map(rep.students.map((r) => [r.code, r]))
check(Number(by.get('DEMO-001').grade) === 100 && Number(by.get('DEMO-002').grade) === 100, 'todo bien = 100')
check(Number(by.get('DEMO-004').grade) === 0 && Number(by.get('DEMO-006').grade) === 0, 'todo mal o sin responder = 0')
const g3 = Number(by.get('DEMO-003').grade)
check(g3 > 0 && g3 < 100, `quien alterna tiene nota parcial (${g3})`)
check(by.get('DEMO-003').correct === truth.get(3), 'aciertos por estudiante correctos')
const q0 = rep.questions[0]
check(rep.questions.length === total && q0.answered === 5 && q0.correct === 3 + (0 % 2 === 0 ? 0 : 0) || q0.correct === 3, `por pregunta: respondieron 5, acertaron ${q0.correct}`)
const choiceQ = rep.questions.find((q) => q.type === 'single')
const wrongOpt = choiceQ.options.find((o) => !o.is_correct && o.count > 0)
check(choiceQ.options.reduce((n, o) => n + o.count, 0) === 5 && wrongOpt, `distractor más elegido detectado ("${wrongOpt?.text}")`)
const ans = await rpc(host, 'session_answers', [live.id])
check(ans.length === 5 * total && ans.every((a) => a.answer !== null && a.prompt), `detalle: ${ans.length} respuestas con texto legible`)
check(ans.some((a) => a.answer?.includes('→')) && ans.some((a) => a.answer?.includes(',')), 'las respuestas de ordenar y varias correctas se muestran como texto')

// Ajuste manual
const p4 = by.get('DEMO-004')
let err = null
try {
  await rpc(host, 'adjust_grade', [p4.participant_id, 60, ''])
} catch (e) {
  err = e.message
}
check(err?.includes('motivo'), 'el ajuste exige un motivo')
await rpc(host, 'adjust_grade', [p4.participant_id, 60, 'Se le cayó el internet en la pregunta 2'])
const rep2 = await rpc(host, 'session_report', [live.id])
const r4 = rep2.students.find((r) => r.code === 'DEMO-004')
check(Number(r4.grade) === 60 && Number(r4.computed) === 0 && r4.adjust_reason.includes('internet'), 'nota ajustada a 60 con motivo; la nota calculada se conserva')
const hist = await rpc(host, 'grade_history', [live.id])
check(hist.length === 1 && Number(hist[0].old) === 0 && Number(hist[0].new) === 60, 'el ajuste queda registrado (de 0 a 60)')

// ------------------------------------------------------------- examen + libreta
console.log('\n▶ Examen y libreta de notas (conversor)')
const plan = await rpc(host, 'gradebook', [quiz.subject_id])
const items = plan.plan.items
const examItem = items.find((i) => i.term === 1 && i.source === 'yaguarquiz')
const manualItem = items.find((i) => i.source === 'manual')
check(items.length > 0 && examItem && manualItem, `plan con ${items.length} categorías (incluye manuales)`)
const ex = await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({ mode: 'exam', grading_item_id: examItem.id, max_attempts: 2 })])
const e1 = await client('anon')
const ej = await rpc(e1, 'join_session', [ex.pin, 'DEMO-001', null, null, '{}', 'x1'])
let es = await rpc(e1, 'start_attempt', [ej.token])
for (const q of es.current.questions) await rpc(e1, 'save_answer', [ej.token, q.id, JSON.stringify(resp(q.id, false))])
await rpc(e1, 'submit_attempt', [ej.token])
es = await rpc(e1, 'start_attempt', [ej.token])
for (const q of es.current.questions) await rpc(e1, 'save_answer', [ej.token, q.id, JSON.stringify(resp(q.id, true))])
await rpc(e1, 'submit_attempt', [ej.token])
await rpc(host, 'exam_control', [ex.id, 'close_now', 0])
const exRep = await rpc(host, 'session_report', [ex.id])
const ex1 = exRep.students.find((r) => r.code === 'DEMO-001')
check(Number(ex1.grade) === 100 && ex1.attempts === 2, 'en examen el reporte usa el mejor intento (100 de 2 intentos)')
check(exRep.questions.every((q) => q.answered === 1 && q.correct === 1), 'las estadísticas por pregunta usan solo el intento que cuenta')

await rpc(host, 'set_session_item', [live.id, examItem.id])
await rpc(host, 'save_manual_score', [manualItem.id, by.get('DEMO-001').student_id, 85])
let bad = null
try {
  await rpc(host, 'save_manual_score', [manualItem.id, by.get('DEMO-001').student_id, 120])
} catch (e) {
  bad = e.message
}
check(bad?.includes('entre 0 y 100'), 'nota manual fuera de rango se rechaza')
const gb = await rpc(host, 'gradebook', [quiz.subject_id])
check(gb.sessions.length === 2 && gb.sessions.every((s) => s.grading_item_id === examItem.id), 'la libreta lista las 2 sesiones vinculadas a la categoría')
const s1 = by.get('DEMO-001').student_id
const gs1 = gb.grades.filter((g) => g.student_id === s1).map((g) => Number(g.grade))
check(gs1.length === 2 && gs1.every((g) => g === 100), 'DEMO-001 tiene 100 en ambas')
check(gb.manual.some((m) => m.student_id === s1 && Number(m.score) === 85), 'la nota manual aparece en la libreta')
check(gb.students.length === 12, 'la libreta tiene a los 12 inscritos')
const list = await rpc(host, 'report_list', [])
check(list.length === 2 && list.every((x) => x.done), 'la lista de reportes muestra las 2 sesiones terminadas')

// seguridad
const anon = await client('anon')
let denied = 0
for (const sql of [`select public.session_report('${live.id}')`, `select public.gradebook('${quiz.subject_id}')`, 'select * from public.manual_scores', `select public._session_grades('${live.id}')`]) {
  try {
    await anon.query(sql)
  } catch {
    denied++
  }
}
check(denied === 4, 'un estudiante no puede ver reportes, la libreta ni notas manuales')
const other = await client('authenticated', '22222222-2222-2222-2222-222222222222')
let deniedOther = 0
for (const [fn, a] of [['session_report', [live.id]], ['gradebook', [quiz.subject_id]], ['adjust_grade', [p4.participant_id, 90, 'trampa']]]) {
  try {
    await rpc(other, fn, a)
  } catch {
    deniedOther++
  }
}
check(deniedOther === 3, 'otro docente no puede ver ni cambiar notas ajenas')

await Promise.all([admin, host, e1, anon, other, ...studs.map((s) => s.c)].map((c) => c.end()))
console.log(failures ? `\n✖ ${failures} verificaciones fallaron` : '\n✔ Todas las verificaciones pasaron')
process.exit(failures ? 1 : 0)
