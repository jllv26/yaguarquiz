// Prueba del sorteo equilibrado (migración 0011) contra PostgreSQL local con todas las migraciones.
//  · Banco con 3 temas (primera etiqueta) y versiones de un mismo caso (etiqueta "var:<nombre>").
//  · Al pedir N al azar: cada estudiante recibe casi lo mismo de cada tema y nunca dos versiones del mismo caso.
//  · Un banco sin etiquetas sigue funcionando al azar puro; sin "N al azar" se usan todas las preguntas.
//  · En un rosco con dos versiones por letra, a cada estudiante le toca una palabra por letra, en orden.
// Uso: node tests/load/balanced-draw-test.mjs
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
const admin = new pg.Client(cfg)
await admin.connect()
const host = await client('authenticated', TEACHER)
const anon = await client('anon')
if (!(await admin.query(`select 1 from public.subjects where code = 'DEMO 023'`)).rowCount) await rpc(host, 'seed_demo_data', [])
const { rows: [subj] } = await admin.query(`select id from public.subjects where code = 'DEMO 023' limit 1`)
const { rows: studs } = await admin.query(
  `select s.university_code code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
    where e.subject_id = $1 order by s.university_code limit 8`, [subj.id])

async function bank(title, rows) {
  const { rows: [q] } = await admin.query(
    `insert into public.quizzes (teacher_id, subject_id, title, status) values ($1, $2, $3, 'published') returning id`, [TEACHER, subj.id, title])
  for (const [i, tags] of rows.entries()) {
    const { rows: [qq] } = await admin.query(
      `insert into public.questions (teacher_id, quiz_id, sort_order, type, prompt, tags) values ($1, $2, $3, 'single', $4, $5) returning id`,
      [TEACHER, q.id, i, `Pregunta ${i + 1}`, tags])
    await admin.query(`insert into public.question_options (teacher_id, question_id, text, is_correct, sort_order) values ($1, $2, 'Sí', true, 0), ($1, $2, 'No', false, 1)`, [TEACHER, qq.id])
  }
  return q.id
}
async function draws(quiz, settings, n = studs.length) {
  const ses = await rpc(host, 'create_session', [quiz, subj.id, JSON.stringify({ mode: 'exam', max_attempts: 1, ...settings })])
  const out = []
  for (const [k, st] of studs.slice(0, n).entries()) {
    const j = await rpc(anon, 'join_session', [ses.pin, st.code, st.ci?.slice(-3) ?? null, null, '{}', `pc-${quiz}-${k}`])
    await rpc(anon, 'start_attempt', [j.token])
    const { rows: [a] } = await admin.query(
      `select question_ids from public.attempts where participant_id = (select id from public.participants where token = $1)`, [j.token])
    out.push(a.question_ids)
  }
  return out
}
const tagsOf = async (ids) => Object.fromEntries((await admin.query(`select id, tags from public.questions where id = any($1)`, [ids])).rows.map((r) => [r.id, r.tags]))

console.log('▶ banco con temas y versiones')
// tema A: 6 preguntas (dos casos con 2 versiones c/u) · tema B: 4 · tema C: 3
const rows = [
  ['Tema A', 'var:a1'], ['Tema A', 'var:a1'], ['Tema A', 'var:a2'], ['Tema A', 'var:a2'], ['Tema A'], ['Tema A'],
  ['Tema B'], ['Tema B'], ['Tema B', 'var:b1'], ['Tema B', 'var:b1'],
  ['Tema C'], ['Tema C'], ['Tema C'],
]
const q1 = await bank('Banco equilibrado', rows)
const d1 = await draws(q1, { pick_count: 6, shuffle_questions: true })
const T = await tagsOf(rows.length ? d1.flat() : [])
for (const [k, ids] of d1.entries()) {
  const cnt = {}
  const fams = []
  for (const id of ids) {
    const t = T[id].find((x) => !x.startsWith('var:'))
    cnt[t] = (cnt[t] ?? 0) + 1
    const f = T[id].find((x) => x.startsWith('var:'))
    if (f) fams.push(f)
  }
  check(ids.length === 6 && cnt['Tema A'] === 2 && cnt['Tema B'] === 2 && cnt['Tema C'] === 2, `estudiante ${k + 1}: 2 de cada tema ${JSON.stringify(cnt)}`)
  check(new Set(fams).size === fams.length, `estudiante ${k + 1}: sin dos versiones del mismo caso`)
}
check(new Set(d1.map((x) => [...x].sort().join())).size > 1, 'los estudiantes reciben sorteos distintos')

// si se piden más preguntas que temas×casos, completa con lo que queda (incluso otras versiones) sin repetir
const d2 = await draws(q1, { pick_count: 11, shuffle_questions: true }, 2)
check(d2.every((ids) => ids.length === 11 && new Set(ids).size === 11), 'pide 11 de 13: recibe 11 sin repetir')
const d3 = await draws(q1, { pick_count: null, shuffle_questions: false }, 1)
check(d3[0].length === rows.length, 'sin «N al azar» se usan todas las preguntas')

console.log('▶ banco sin etiquetas')
const q2 = await bank('Banco sin etiquetas', Array.from({ length: 10 }, () => []))
const d4 = await draws(q2, { pick_count: 4, shuffle_questions: true }, 4)
check(d4.every((ids) => ids.length === 4), 'al azar puro: 4 de 10')
check(new Set(d4.map((x) => [...x].sort().join())).size > 1, 'sorteos distintos')

console.log('▶ rosco con dos versiones por letra')
const { rows: [rq] } = await admin.query(
  `insert into public.quizzes (teacher_id, subject_id, title, status) values ($1, $2, 'Rosco doble', 'published') returning id`, [TEACHER, subj.id])
const W = [['A', 'Acre'], ['A', 'Amazonía'], ['B', 'Bahía'], ['B', 'Beni'], ['C', 'Cobija'], ['C', 'Castaña'], ['D', 'Dorado'], ['D', 'Delfín']]
await rpc(host, 'save_activity', [rq.id, JSON.stringify({ type: 'rosco', tries: 1 }), JSON.stringify(W.map(([g, t]) => ({ term: t, prompt: `Pista de ${t}`, group: g })))])
const ses = await rpc(host, 'create_session', [rq.id, subj.id, JSON.stringify({ mode: 'homework', pick_count: 4, shuffle_questions: true })])
const letters = []
for (const [k, st] of studs.slice(0, 4).entries()) {
  const j = await rpc(anon, 'join_session', [ses.pin, st.code, st.ci?.slice(-3) ?? null, null, '{}', `pc-rosco-${k}`])
  await rpc(anon, 'start_attempt', [j.token])
  const s = await rpc(anon, 'activity_state', [j.token])
  letters.push(s.current.activity.board.items.map((x) => x.letter).join(''))
}
check(letters.every((l) => l === 'ABCD'), `una palabra por letra y en orden (${letters.join(', ')})`)

await Promise.all([admin.end(), host.end(), anon.end()])
console.log(failures ? `✖ ${failures} verificaciones fallaron` : '✓ Sorteo equilibrado: todo correcto')
process.exit(failures ? 1 : 0)
