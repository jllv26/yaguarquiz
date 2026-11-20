// Prueba de 0021: versiones distintas por estudiante y las investigaciones calificadas por el docente.
// Uso: node tests/load/variants-test.mjs
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
const admin = new pg.Client(cfg)
await admin.connect()
const host = await client('authenticated', TEACHER)
const anon = await client('anon')
if (!(await admin.query(`select 1 from public.subjects where code = 'DEMO 023'`)).rowCount) await rpc(host, 'seed_demo_data', [])
const { rows: [subj] } = await admin.query(`select id, portal_code from public.subjects where code = 'DEMO 023' limit 1`)
const { rows: st } = await admin.query(
  `select s.id, s.university_code code from public.students s join public.enrollments e on e.student_id = s.id
    where e.subject_id = $1 order by s.university_code limit 4`, [subj.id])
await admin.query(`update public.students set ci = null, email = 'x' || university_code || '@ejemplo.bo' where id = any($1)`, [st.map((x) => x.id)])
const newQuiz = async (title) => (await admin.query(
  `insert into public.quizzes (teacher_id, subject_id, title, status) values ($1, $2, $3, 'published') returning id`, [TEACHER, subj.id, title])).rows[0].id
const join = async (pin, code, dev) => {
  const j = await rpc(anon, 'join_session', [pin, code, null, null, '{}', dev])
  await rpc(anon, 'start_attempt', [j.token])
  return j.token
}
const board = async (tok) => (await rpc(anon, 'activity_state', [tok])).current.activity
const play = (tok, action, data) => rpc(anon, 'activity_play', [tok, action, JSON.stringify(data)])

console.log('▶ Sopa de letras con 3 versiones')
const W = ['COBIJA', 'ACRE', 'PANDO', 'JAGUAR', 'CASTANA', 'SIRINGA', 'BENI', 'TAHUAMANU', 'MAPAJO']
const items = W.map((t) => ({ term: t, prompt: 'Pista de ' + t }))
const grid = (k) => ({ letters: Array.from({ length: 10 }, (_, r) => 'ABCDEFGHIJ'.slice(r % 3) + 'X'.repeat(r % 3)), placements: [], v: k })
const ws = await newQuiz('Sopa con versiones')
await rpc(host, 'save_activity', [ws, JSON.stringify({ type: 'wordsearch', show_words: true, grid: grid(0),
  variants: [{ grid: grid(0), pos: [0, 1, 2] }, { grid: grid(1), pos: [3, 4, 5] }, { grid: grid(2), pos: [6, 7, 8] }] }), JSON.stringify(items)])
const s1 = await rpc(host, 'create_session', [ws, subj.id, JSON.stringify({ mode: 'homework', max_attempts: 2 })])
const toks = []
for (const [i, x] of st.slice(0, 3).entries()) toks.push(await join(s1.pin, x.code, 'pc-v' + i))
const boards = await Promise.all(toks.map(board))
const words = boards.map((b) => b.board.clues.map((c) => c.text).sort().join(','))
check(new Set(words).size === 3, `3 estudiantes → 3 versiones distintas (${words.join(' | ')})`)
check(boards.every((b) => b.total === 3), 'cada uno con las 3 palabras de su versión')
const w0 = boards[0].board.clues[0].text
check((await play(toks[0], 'find', { value: w0 })).correct === true, 'encuentra una palabra de su versión')
const other = boards[1].board.clues[0].text
check((await play(toks[0], 'find', { value: other })).correct === false, 'una palabra de la versión del compañero no le cuenta')
const v0 = (await admin.query(`select variant from public.attempts a join public.participants p on p.id = a.participant_id where p.token = $1`, [toks[0]])).rows[0].variant
await rpc(anon, 'submit_attempt', [toks[0]])
await rpc(anon, 'start_attempt', [toks[0]])
const v1 = (await admin.query(`select variant from public.attempts a join public.participants p on p.id = a.participant_id where p.token = $1 and a.number = 2`, [toks[0]])).rows[0].variant
check(v1 !== v0, `en el 2.º intento le toca otra versión (${v0} → ${v1})`)

console.log('▶ Investigación con casos distintos')
const rs = await newQuiz('Investigación: el negocio de tu caso')
const criteria = [{ title: 'Datos reales' }, { title: 'Análisis' }, { title: 'Propuesta' }]
await rpc(host, 'save_activity', [rs, JSON.stringify({ type: 'research', min_words: 10, criteria,
  variants: [{ case: { title: 'Heladería del centro' } }, { case: { title: 'Farmacia de barrio' } }, { case: { title: 'Taller de motos' } }] }),
  JSON.stringify([{ term: '¿Qué redes usa?', prompt: 'Revisa su página' }, { term: '¿Qué mejorarías?', prompt: '' }])])
const s2 = await rpc(host, 'create_session', [rs, subj.id, JSON.stringify({ mode: 'homework', max_attempts: 1 })])
const r0 = await join(s2.pin, st[0].code, 'pc-r0')
const r1 = await join(s2.pin, st[1].code, 'pc-r1')
const b0 = await board(r0)
const b1 = await board(r1)
check(b0.board.case.title !== b1.board.case.title, `cada uno recibe otro caso (${b0.board.case.title} / ${b1.board.case.title})`)
check(b0.board.questions.length === 2 && b0.board.criteria.length === 3, 've las preguntas y cómo se califica')
const long = 'Mi análisis del negocio '.repeat(60)
const sv = await play(r0, 'save', { item: b0.board.questions[0].key, value: long })
check(sv.ok && sv.saved, `guarda respuestas largas (${long.length} caracteres)`)
await play(r0, 'save', { item: b0.board.questions[1].key, value: 'Propongo publicar videos cortos de los helados del día con precios claros.' })
check((await board(r0)).board.questions[0].value === long.trim(), 'al recargar, sus respuestas siguen ahí')
check((await play(r0, 'answer', { item: b0.board.questions[0].key, value: 'x' })).error === 'action', 'en la investigación solo se guarda texto')
await rpc(anon, 'submit_attempt', [r0])
const g0 = (await admin.query(`select a.grade from public.attempts a join public.participants p on p.id = a.participant_id where p.token = $1`, [r0])).rows[0]
check(g0.grade === null, 'al entregar queda «en revisión» (sin nota automática)')
check((await rpc(anon, 'activity_state', [r0])).review === null, 'no muestra revisión de «respuestas correctas»')
const L = await rpc(host, 'research_list', [s2.id])
check(L.items.length === 1 && L.items[0].case.title === b0.board.case.title && L.items[0].answers[0].text === long.trim(), 'el docente ve la entrega con su caso y respuestas')
check(/Marque los 3 criterios/.test(await err(host, 'research_grade', [L.items[0].attempt, [2, 3, 1], null])), 'solo Cumple (2) / A medias (1) / No cumple (0)')
check(/Marque los 3 criterios/.test(await err(host, 'research_grade', [L.items[0].attempt, [2, 1], null])), 'hay que marcar todos los criterios')
await admin.query(`insert into public.teacher_settings (teacher_id, mail_enabled) values ($1, true) on conflict (teacher_id) do update set mail_enabled = true`, [TEACHER])
const gr = await rpc(host, 'research_grade', [L.items[0].attempt, [2, 1, 0], 'Buen análisis, falta propuesta'])
check(Number(gr.grade) === 50, `2 + 1 + 0 de 6 → ${gr.grade}`)
const P = await rpc(anon, 'portal_lookup', [subj.portal_code, st[0].code, null])
check(Number(P.items.find((x) => x.id === s2.id)?.best) === 50, 'la nota aparece en su aula')
check((await admin.query(`select count(*)::int n from public.mail_outbox where kind = 'grade' and ref_id = $1`, [L.items[0].attempt])).rows[0].n === 1, 'su nota queda en cola para el correo')
const other2 = await client('authenticated', '22222222-2222-2222-2222-222222222222')
check(/no es suya/.test(await err(other2, 'research_grade', [L.items[0].attempt, [2, 2, 2], null])), 'otro docente no puede calificarla')

await Promise.all([admin.end(), host.end(), anon.end(), other2.end()])
console.log(failures ? `\n✖ ${failures} fallas` : '\n✓ Todo bien')
process.exit(failures ? 1 : 0)
