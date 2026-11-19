// Prueba de las actividades estilo Educaplay (Fase 9) contra PostgreSQL local con todas las migraciones.
// Para cada uno de los 10 tipos: el docente guarda la actividad, la lanza como tarea, dos estudiantes juegan
// (uno bien y otro mal) y se verifica la nota, los intentos por palabra, que el tablero no revele respuestas
// y que las claves de memoria/relacionar no se puedan calcular desde el navegador.
// Uso: node tests/load/activities-test.mjs
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
const rpcErr = async (c, fn, args) => {
  try {
    await rpc(c, fn, args)
    return null
  } catch (e) {
    return e.message
  }
}

const admin = new pg.Client(cfg)
await admin.connect()
const host = await client('authenticated', TEACHER)
const anon = await client('anon')
if (!(await admin.query(`select 1 from public.subjects where code = 'DEMO 023'`)).rowCount) await rpc(host, 'seed_demo_data', [])
const { rows: [subj] } = await admin.query(`select id from public.subjects where code = 'DEMO 023' limit 1`)
const { rows: studs } = await admin.query(
  `select s.university_code code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
    where e.subject_id = $1 order by s.university_code limit 2`, [subj.id])

const W = [
  { term: 'Cobija', prompt: 'Capital del departamento de Pando', group: 'Pando' },
  { term: 'Riberalta', prompt: 'Ciudad amazónica del Beni', group: 'Beni' },
  { term: 'Jaguar', prompt: 'Felino más grande de América', group: 'Pando' },
  { term: 'Castaña', prompt: 'Producto estrella de la Amazonía boliviana', group: 'Beni' },
]
const ACTS = {
  crossword: { layout: { rows: 8, cols: 9, words: [{ i: 0, n: 1, row: 0, col: 0, dir: 'across' }, { i: 1, n: 2, row: 0, col: 1, dir: 'down' }, { i: 2, n: 3, row: 4, col: 0, dir: 'across' }, { i: 3, n: 4, row: 0, col: 5, dir: 'down' }] } },
  wordsearch: { show_words: false, grid: { letters: ['COBIJAXX', 'RIBERALT', 'JAGUARXX', 'CASTAÑAX'] } },
  matching: {}, memory: {}, classify: {}, anagram: {}, hangman: {}, rosco: {},
  sentence: {},
  fill_text: { text: 'La capital de Pando es {{0}} y en el Beni está {{1}}. El {{2}} vive en la selva y la {{3}} se exporta.', word_bank: true, distractors: ['Trinidad'] },
}
const items = (type) => type === 'sentence'
  ? [{ term: 'La castaña se exporta desde Cobija', prompt: 'Ordene la frase' }, { term: 'El jaguar es el rey de la selva', prompt: 'Ordene la frase' }]
  : type === 'rosco' ? W.map((w) => ({ ...w, group: w.term[0] })) : W
const termOf = (type, i) => items(type)[i].term

const leakRe = (type) => new RegExp(items(type).map((w) => w.term.replace(/ñ/g, '[ñÑ]')).join('|'), 'i')

for (const type of Object.keys(ACTS)) {
  console.log(`▶ ${type}`)
  const { rows: [quiz] } = await admin.query(
    `insert into public.quizzes (teacher_id, subject_id, title, status) values ($1, $2, $3, 'published') returning id`, [TEACHER, subj.id, `Actividad ${type}`])
  const n = await rpc(host, 'save_activity', [quiz.id, JSON.stringify({ type, tries: 2, ...ACTS[type] }), JSON.stringify(items(type))])
  check(n === items(type).length, `guarda ${n} palabras`)
  // guardar otra vez conserva los ids (los tableros se refieren por posición)
  await rpc(host, 'save_activity', [quiz.id, JSON.stringify({ type, tries: 2, ...ACTS[type] }), JSON.stringify(
    (await admin.query(`select id, term, prompt, tags from public.questions where quiz_id = $1 order by sort_order`, [quiz.id])).rows.map((r) => ({ id: r.id, term: r.term, prompt: r.prompt, group: r.tags[0] })))])
  if (type === 'crossword') {
    check(/en vivo/.test(await rpcErr(host, 'create_session', [quiz.id, subj.id, JSON.stringify({ mode: 'live' })])), 'no se puede lanzar en vivo')
  }
  const ses = await rpc(host, 'create_session', [quiz.id, subj.id, JSON.stringify({ mode: 'homework', show_correct: 'each', max_attempts: 1 })])
  const info = await rpc(anon, 'session_info_activity', [ses.pin])
  check(info.activity_type === type, 'el PIN informa el tipo de actividad')

  const players = []
  for (const st of studs) {
    const j = await rpc(anon, 'join_session', [ses.pin, st.code, st.ci?.slice(-3) ?? null, null, '{}', `pc-${st.code}`])
    await rpc(anon, 'start_attempt', [j.token])
    players.push(j.token)
  }
  const [good, bad] = players
  const st = await rpc(anon, 'activity_state', [good])
  const board = st.current.activity
  const boardJson = JSON.stringify(board.board)
  const shown = { matching: 'left', memory: 'cards', classify: 'cards', wordsearch: null, fill_text: 'bank', anagram: null, sentence: null }
  if (!(type in shown)) check(!leakRe(type).test(boardJson), 'el tablero no contiene las respuestas')
  check(!JSON.stringify(st.current).includes('"term"') && !('questions' in st.current), 'no se envía el campo term ni las preguntas genéricas')
  const { rows: qs } = await admin.query(`select id, term, tags from public.questions where quiz_id = $1 order by sort_order`, [quiz.id])
  const salt = (await admin.query(`select game_salt, id from public.attempts where participant_id = (select id from public.participants where token = $1)`, [good])).rows[0]

  // Jugadas del estudiante que sabe todo (bueno) y del que se equivoca (malo)
  const play = (tok, action, data) => rpc(anon, 'activity_play', [tok, action, JSON.stringify(data)])
  if (['crossword', 'rosco', 'anagram', 'sentence', 'fill_text'].includes(type)) {
    for (const [i, q] of qs.entries()) {
      const r = await play(good, 'answer', { item: q.id, value: i === 0 ? termOf(type, i).toUpperCase() : termOf(type, i) })
      check(r.correct === true && r.points === 1000, `acierto ${i + 1}`)
    }
    const r1 = await play(bad, 'answer', { item: qs[0].id, value: 'nada' })
    check(r1.correct === false && r1.tries_left === 1 && !r1.answer, 'error 1: le queda 1 intento y no revela')
    const r2 = await play(bad, 'answer', { item: qs[0].id, value: termOf(type, 0) })
    check(r2.correct && r2.points === 600, 'acierta al 2.º intento: 60 %')
    await play(bad, 'answer', { item: qs[1].id, value: 'x' })
    const r3 = await play(bad, 'answer', { item: qs[1].id, value: 'y' })
    check(r3.done && !r3.correct && r3.answer, 'agota intentos: se revela (retroalimentación inmediata)')
    check((await play(bad, 'answer', { item: qs[1].id, value: termOf(type, 1) })).error === 'already', 'no puede responder otra vez')
  } else if (type === 'matching') {
    for (const q of qs) {
      // el estudiante bueno identifica la definición correcta por su texto (no por la clave)
      const { rows: [{ prompt }] } = await admin.query('select prompt from public.questions where id = $1', [q.id])
      const key = board.board.right.find((x) => x.text === prompt).key
      check((await play(good, 'answer', { item: q.id, value: key })).correct, 'relaciona bien')
    }
    const other = (await rpc(anon, 'activity_state', [bad])).current.activity.board.right
    check((await play(bad, 'answer', { item: qs[0].id, value: other[0].key === other.find((x) => x.text === W[0].prompt).key ? other[1].key : other[0].key })).correct === false, 'relación equivocada')
    const fakeKey = (await admin.query(`select substr(md5($1 || ':' || $2 || ':d'), 1, 16) k`, [salt.id, qs[0].id])).rows[0].k
    check(!board.board.right.some((x) => x.key === fakeKey), 'la clave no se puede calcular con datos del navegador')
  } else if (type === 'memory') {
    const cards = board.board.cards
    check(cards.length === 8, '8 cartas (4 parejas)')
    // pareja errónea y después las correctas (se buscan por texto)
    const byText = (t) => cards.find((c) => c.text === t).key
    check((await play(good, 'pair', { a: byText(W[0].term), b: byText(W[1].prompt) })).correct === false, 'pareja errónea')
    for (const w of W) check((await play(good, 'pair', { a: byText(w.term), b: byText(w.prompt) })).correct, `pareja ${w.term}`)
    const bcards = (await rpc(anon, 'activity_state', [bad])).current.activity.board.cards
    for (let k = 0; k < 4; k++) await play(bad, 'pair', { a: bcards.find((c) => c.text === W[0].term).key, b: bcards.find((c) => c.text === W[1].prompt).key })
    const r = await play(bad, 'pair', { a: bcards.find((c) => c.text === W[0].term).key, b: bcards.find((c) => c.text === W[0].prompt).key })
    check(r.correct && r.points < 1000, `con muchos errores la pareja vale menos (${r.points})`)
  } else if (type === 'classify') {
    for (const [i, q] of qs.entries()) check((await play(good, 'answer', { item: q.id, value: W[i].group })).correct, `clasifica ${W[i].term}`)
    check((await play(bad, 'answer', { item: qs[0].id, value: 'Beni' })).correct === false, 'grupo equivocado')
  } else if (type === 'wordsearch') {
    check(board.board.clues.every((c) => !/cobija|riberalta|jaguar|casta/i.test(c.text)), 'con definiciones, la lista no muestra las palabras')
    for (const w of W) check((await play(good, 'find', { value: w.term, cells: [[0, 0]] })).correct, `encuentra ${w.term}`)
    check((await play(bad, 'find', { value: 'XAJIBOC'.split('').reverse().join('') })).correct === false, 'palabra que no está')
    check((await play(bad, 'find', { value: 'AJIBOC' })).correct === true, 'acepta la palabra marcada al revés')
    check((await play(bad, 'find', { value: 'COBIJA' })).correct === false, 'no cuenta dos veces la misma palabra')
  } else if (type === 'hangman') {
    for (const [i, q] of qs.entries()) {
      let r
      for (const ch of [...new Set(termOf(type, i).toUpperCase().normalize('NFD').replace(/[̀-̂̄-ͯ]/g, '').normalize('NFC'))]) r = await play(good, 'letter', { item: q.id, letter: ch })
      check(r.done && r.correct && r.points === 1000, `adivina ${termOf(type, i)} (${r.mask})`)
    }
    let r
    for (const ch of 'XZQWKV') r = await play(bad, 'letter', { item: qs[0].id, letter: ch })
    check(r.done && !r.correct && r.wrong === 6, 'pierde con 6 letras equivocadas')
    const m = await play(bad, 'letter', { item: qs[2].id, letter: 'A' })
    check(m.mask === '_A__A_' && m.hit, `la máscara muestra las A (${m.mask})`)
  }

  await rpc(anon, 'submit_attempt', [good])
  const g1 = await rpc(anon, 'submit_attempt', [bad])
  const { rows: [r1] } = await admin.query(`select grade from public.attempts where participant_id = (select id from public.participants where token = $1)`, [good])
  check(Number(r1.grade) === 100, `nota del que acierta todo: ${r1.grade}`)
  check(Array.isArray(g1.review ?? (await rpc(anon, 'activity_state', [bad])).review), 'revisión disponible al terminar')
  const rv = (await rpc(anon, 'activity_state', [bad])).review
  check(rv?.length === qs.length && rv.some((x) => x.correct === false), `revisión con ${rv?.length} palabras`)
  const rep = await rpc(host, 'session_report', [ses.id])
  check(rep && JSON.stringify(rep).includes('"grade"'), 'el reporte de la sesión funciona')
}

// Una copia de la actividad conserva el tablero (las palabras se numeran de nuevo al copiar)
{
  console.log('▶ copia de crucigrama y completar')
  for (const t of ['crossword', 'fill_text']) {
    const { rows: [src] } = await admin.query(`select id from public.quizzes where title = $1`, [`Actividad ${t}`])
    const copy = await rpc(host, 'duplicate_quiz', [src.id])
    const ses = await rpc(host, 'create_session', [copy, subj.id, JSON.stringify({ mode: 'homework' })])
    const j = await rpc(anon, 'join_session', [ses.pin, studs[0].code, null, null, '{}', 'pc-copia'])
    await rpc(anon, 'start_attempt', [j.token])
    const b = (await rpc(anon, 'activity_state', [j.token])).current.activity.board
    check(t === 'crossword' ? b.words?.length === 4 : b.gaps?.length === 4 && b.gaps.every((g, i) => g.i === i), `la copia de ${t} conserva las 4 palabras en su lugar`)
  }
}

// Una evaluación normal (no actividad) llega igual que con exam_state: con sus preguntas y sin tablero
{
  const { rows: [nq] } = await admin.query(`select id from public.quizzes where title like 'Repaso Unidad 1%' limit 1`)
  const ses = await rpc(host, 'create_session', [nq.id, subj.id, JSON.stringify({ mode: 'homework' })])
  const j = await rpc(anon, 'join_session', [ses.pin, studs[0].code, null, null, '{}', 'pc-normal'])
  await rpc(anon, 'start_attempt', [j.token])
  const st = await rpc(anon, 'activity_state', [j.token])
  check(st.activity_type === null && Array.isArray(st.current.questions) && st.current.questions.length > 0 && !st.current.activity, 'evaluación normal: activity_state no la altera')
}

// Las funciones internas no son accesibles para el estudiante
check(/permission denied/.test(await rpcErr(anon, '_gkey', ['x', '00000000-0000-0000-0000-000000000000', 'd'])), 'el estudiante no puede llamar _gkey')
check(/permission denied/.test(await rpcErr(anon, 'save_activity', ['00000000-0000-0000-0000-000000000000', '{}', '[]'])), 'el estudiante no puede guardar actividades')

await Promise.all([admin.end(), host.end(), anon.end()])
console.log(failures ? `✖ ${failures} verificaciones fallaron` : '✓ Actividades: todo correcto')
process.exit(failures ? 1 : 0)
