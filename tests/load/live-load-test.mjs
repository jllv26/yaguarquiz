// Prueba de carga del juego en vivo contra un PostgreSQL local con las migraciones aplicadas.
// Simula al docente (proyector) y a N estudiantes que se unen y responden AL MISMO TIEMPO.
// Uso: node tests/load/live-load-test.mjs [N=45]
import pg from 'pg'

const N = Number(process.argv[2] ?? 45)
const TEACHER = '11111111-1111-1111-1111-111111111111'
const cfg = { host: '/tmp', port: 5544, user: 'postgres', database: 't' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
let failures = 0
const check = (cond, msg) => {
  if (!cond) {
    failures++
    console.log('  ✖', msg)
  } else console.log('  ✓', msg)
}

async function client(role, sub = '') {
  const c = new pg.Client(cfg)
  await c.connect()
  await c.query(`set role ${role}`)
  await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub])
  return c
}
const rpc = async (c, fn, args) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) as r`, args)).rows[0].r

// ------------------------------------------------------------------ preparación
const host = await client('authenticated', TEACHER)
await rpc(host, 'seed_demo_data', [])
const { rows: [quiz] } = await host.query(`select id, subject_id from public.quizzes where title like 'Repaso Unidad 1%' limit 1`)
const { rows: correctRows } = await host.query(
  `select q.id, q.type, q.base_points, q.accepted_answers,
          coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'c', o.is_correct, 'pos', o.correct_position) order by o.sort_order) filter (where o.id is not null), '[]') as opts
     from public.questions q left join public.question_options o on o.question_id = q.id
    where q.quiz_id = $1 group by q.id order by q.sort_order`, [quiz.id])
const answerKey = new Map(correctRows.map((r) => [r.id, r]))

console.log(`\n▶ Sesión en modo libre (apodos) con ${N} estudiantes virtuales`)
const created = await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({ identification: 'nickname', show_ranking: true })])
const sessionId = created.id
check(/^\d{6}$/.test(created.pin), `PIN de 6 dígitos generado (${created.pin})`)

// ------------------------------------------------------------------ unirse en paralelo
const bots = await Promise.all(Array.from({ length: N }, async (_, i) => {
  const c = await client('anon')
  // los que hacen "doble clic" usan conexiones separadas (como peticiones HTTP paralelas)
  const extra = i % 5 === 0 ? [await client('anon'), await client('anon')] : []
  return { i, c, extra, nick: `Bot ${String(i + 1).padStart(2, '0')}`, device: `dev-${i}`, token: null, expectedScore: 0, answered: 0, accepted: 0 }
}))
const t0 = Date.now()
const joins = await Promise.all(bots.map((b) => rpc(b.c, 'join_session', [created.pin, null, null, b.nick, JSON.stringify({ animal: '🐆', color: '#1B7339' }), b.device])))
joins.forEach((j, i) => (bots[i].token = j.token))
check(joins.every((j) => j.ok), `${N} estudiantes se unieron a la vez en ${Date.now() - t0} ms`)
const dupNick = await rpc(bots[0].c, 'join_session', [created.pin, null, null, 'bot 01', '{}', 'otra-pc'])
check(dupNick.error === 'nickname_taken', 'apodo repetido desde otra PC se rechaza')
const rejoin = await rpc(bots[0].c, 'join_session', [created.pin, null, null, 'Bot 01', '{}', 'dev-0'])
check(rejoin.ok && rejoin.token === bots[0].token, 'recargar la página desde la misma PC recupera la misma sesión')
check((await rpc(bots[1].c, 'join_session', [created.pin, null, null, 'Puta madre', '{}', 'x'])).error === 'nickname_bad', 'apodo inapropiado se rechaza')
check((await rpc(bots[1].c, 'join_session', ['000000', null, null, 'Nadie', '{}', 'x'])).error === 'pin', 'PIN inexistente da error claro')

let st = await rpc(host, 'host_state', [sessionId])
check(st.participants.length === N, `el proyector ve ${st.participants.length} conectados`)

// ------------------------------------------------------------------ preguntas
const total = st.session.total
await rpc(host, 'host_advance', [sessionId]) // lobby → countdown
for (let qi = 0; qi < total; qi++) {
  st = await rpc(host, 'host_advance', [sessionId]) // countdown → question
  const qid = st.question.id
  const key = answerKey.get(qid)
  console.log(`\n▶ Pregunta ${qi + 1}/${total} (${key.type})`)

  // Ningún estado del estudiante debe traer la respuesta correcta
  const states = await Promise.all(bots.map((b) => rpc(b.c, 'get_state', [b.token])))
  const leak = states.some((s) => {
    const txt = JSON.stringify(s)
    return txt.includes('is_correct') || txt.includes('correct_position') || txt.includes('accepted_answers') || txt.includes('correct_keys') || s.reveal
  })
  check(!leak, 'durante la pregunta ningún estudiante recibe la respuesta correcta')
  check(states.every((s) => s.question?.id === qid && s.session.phase === 'question'), 'todos ven la misma pregunta')

  // Respuestas simultáneas (algunos aciertan, otros no, algunos no responden, algunos hacen doble clic)
  const opts = states[0].question.options
  await Promise.all(bots.map(async (b) => {
    if (b.i % 9 === 8) return // no responde
    await sleep(rand(0, 1500))
    const right = b.i % 3 !== 0
    let resp
    if (key.type === 'single' || key.type === 'true_false' || key.type === 'image_choice') {
      const target = key.opts.find((o) => o.c === right) ?? key.opts[0]
      resp = { kind: 'choice', key: target.id }
    } else if (key.type === 'multiple') {
      resp = { kind: 'choices', keys: key.opts.filter((o) => (right ? o.c : !o.c)).map((o) => o.id) }
    } else if (key.type === 'short_text') {
      resp = { kind: 'text', text: right ? `  ${key.accepted_answers[0].toUpperCase()} ` : 'no sé' }
    } else {
      const ord = [...key.opts].sort((a, b) => a.pos - b.pos).map((o) => o.id)
      resp = { kind: 'order', keys: right ? ord : [...ord].reverse() }
    }
    const conns = [b.c, ...b.extra] // doble/triple clic simultáneo
    const res = await Promise.all(conns.map((c) => rpc(c, 'submit_answer', [b.token, qid, JSON.stringify(resp)])))
    b.answered++
    b.accepted += res.filter((r) => r.ok).length
  }))
  st = await rpc(host, 'host_state', [sessionId])
  const expected = bots.filter((b) => b.i % 9 !== 8).length
  check(st.answered === expected, `respuestas registradas: ${st.answered}/${expected} (ninguna perdida ni duplicada)`)

  // Llega tarde (después de cerrar)
  st = await rpc(host, 'host_advance', [sessionId]) // question → reveal
  const lateResp = opts.length ? { kind: 'choice', key: opts[0].key } : { kind: 'text', text: 'tarde' }
  const late = await rpc(bots[8].c, 'submit_answer', [bots[8].token, qid, JSON.stringify(lateResp)])
  check(!late.ok && late.error === 'closed', 'respuesta después de cerrar se rechaza')
  const rs = await rpc(bots[1].c, 'get_state', [bots[1].token])
  check(rs.session.phase === 'reveal' && rs.reveal && rs.my_answer?.correct === true, 'en la revelación el estudiante ve la correcta y su resultado')
  await rpc(host, 'host_advance', [sessionId]) // reveal → leaderboard
  if (qi < total - 1) await rpc(host, 'host_advance', [sessionId]) // leaderboard → countdown
}
st = await rpc(host, 'host_advance', [sessionId]) // leaderboard → finished
check(st.session.phase === 'finished', 'la sesión termina con el podio')
// Doble avance (dos pestañas del proyector) no salta preguntas
const dbl = await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({ identification: 'nickname' })])
await Promise.all([rpc(host, 'host_advance', [dbl.id, 'lobby']), rpc(await client('authenticated', TEACHER), 'host_advance', [dbl.id, 'lobby'])])
let dst = await rpc(host, 'host_state', [dbl.id])
check(dst.session.phase === 'countdown' && dst.session.question_index === 0, 'dos clics simultáneos en "Siguiente" avanzan una sola vez')
await rpc(host, 'host_end', [dbl.id])
// En "ordenar" nunca se muestra ya ordenado
const admin = new pg.Client(cfg)
await admin.connect()
const { rows: ordQ } = await admin.query(`select q.id from public.questions q where q.type = 'ordering'`)
for (const r of ordQ) {
  const { rows: [x] } = await admin.query(`select public._display_order($1) = (select array_agg(id order by correct_position) from public.question_options where question_id = $1) as same`, [r.id])
  check(!x.same, 'la pregunta de ordenar no aparece ya resuelta')
}
await admin.end()

// ------------------------------------------------------------------ verificación final
const totals = await host.query(
  `select p.nickname, p.total_score, coalesce(sum(a.game_points), 0)::int as sum_points, count(a.id)::int as n
     from public.participants p left join public.answers a on a.participant_id = p.id
    where p.session_id = $1 group by p.id`, [sessionId])
check(totals.rows.every((r) => r.total_score === r.sum_points), 'el puntaje de cada estudiante coincide con la suma de sus respuestas')
check(bots.every((b) => b.accepted === b.answered), 'el doble clic cuenta una sola vez')
const fin = await rpc(bots[1].c, 'get_state', [bots[1].token])
check(fin.summary && fin.summary.grade === 100, `resumen final del estudiante (nota ${fin.summary?.grade}, puesto ${fin.summary?.rank}/${fin.summary?.of})`)
const fin0 = await rpc(bots[0].c, 'get_state', [bots[0].token])
check(fin0.summary.grade === 0, `quien falla todo tiene nota 0 (bot 01: ${fin0.summary.grade})`)
check(Array.isArray(fin.leaderboard) && fin.leaderboard.length === 5, 'podio / top 5 disponible')

// ------------------------------------------------------------------ modo lista oficial
console.log('\n▶ Sesión con lista oficial (RU) + CI')
const roster = await rpc(host, 'create_session', [quiz.id, quiz.subject_id, JSON.stringify({ identification: 'roster', require_ci: true })])
const s1 = await client('anon')
check((await rpc(s1, 'lookup_student', [roster.pin, 'demo-001'])).name === 'Pérez Gómez, Ana Lucía', 'RU en minúsculas encuentra al estudiante y muestra su nombre')
check((await rpc(s1, 'lookup_student', [roster.pin, 'NO-EXISTE'])).error === 'not_enrolled', 'RU no inscrito se rechaza')
check((await rpc(s1, 'join_session', [roster.pin, 'DEMO-001', '999', null, '{}', 'pc-1'])).error === 'ci', 'CI incorrecto se rechaza')
const j1 = await rpc(s1, 'join_session', [roster.pin, 'DEMO-001', '001', null, '{}', 'pc-1'])
check(j1.ok && j1.nickname === 'Ana P.', `entra con RU + CI (aparece como "${j1.nickname}")`)
const other = await rpc(s1, 'join_session', [roster.pin, 'DEMO-001', '001', null, '{}', 'pc-2'])
check(other.error === 'other_device', 'el mismo RU desde otra PC queda bloqueado')
let hs = await rpc(host, 'host_state', [roster.id])
const ana = hs.participants.find((p) => p.nickname === 'Ana P.')
check(ana.takeover_pending, 'el docente ve la alerta de cambio de PC')
check(hs.absent.length === 11, `el docente ve ${hs.absent.length} ausentes de la lista`)
await host.query('select public.host_participant($1, $2)', [ana.id, 'authorize_device'])
check((await rpc(s1, 'join_session', [roster.pin, 'DEMO-001', '001', null, '{}', 'pc-2'])).token === j1.token, 'tras autorizar, entra desde la otra PC con el mismo puntaje')
await host.query('select public.host_participant($1, $2)', [ana.id, 'kick'])
check((await rpc(s1, 'get_state', [j1.token])).error === 'kicked', 'expulsado no puede seguir')

// Pausa y +10 s
await rpc(host, 'host_advance', [roster.id])
await rpc(host, 'host_advance', [roster.id])
hs = await rpc(host, 'host_state', [roster.id])
const ends1 = new Date(hs.session.question_ends_at).getTime()
await rpc(host, 'host_add_time', [roster.id, 10])
hs = await rpc(host, 'host_state', [roster.id])
check(Math.round((new Date(hs.session.question_ends_at).getTime() - ends1) / 1000) === 10, '+10 s extiende el tiempo')
await rpc(host, 'host_pause', [roster.id, true])
const s2 = await client('anon')
const j2 = await rpc(s2, 'join_session', [roster.pin, 'DEMO-002', '002', null, '{}', 'pc-9'])
check((await rpc(s2, 'submit_answer', [j2.token, hs.question.id, JSON.stringify({ kind: 'choice', key: hs.question.options[0].key })])).error === 'closed', 'en pausa no se aceptan respuestas')
await sleep(1100)
await rpc(host, 'host_pause', [roster.id, false])
hs = await rpc(host, 'host_state', [roster.id])
check(new Date(hs.session.question_ends_at).getTime() - ends1 >= 11000, 'al reanudar se descuenta el tiempo en pausa')

// Un estudiante no puede usar funciones del docente ni leer tablas
const anon = await client('anon')
let blocked = 0
for (const sql of ['select * from public.questions', 'select * from public.question_options', `select public.host_state('${sessionId}')`, `select public.host_advance('${sessionId}')`, `select public._grade('${hs.question.id}', '{}')`]) {
  try {
    await anon.query(sql)
  } catch {
    blocked++
  }
}
check(blocked === 5, 'un estudiante no puede leer preguntas ni usar funciones del docente')
// Otro docente tampoco controla la sesión
const other2 = await client('authenticated', '22222222-2222-2222-2222-222222222222')
let blocked2 = false
try {
  await other2.query('select public.host_advance($1)', [sessionId])
} catch {
  blocked2 = true
}
check(blocked2, 'otro docente no puede controlar la sesión')

await Promise.all([host, ...bots.flatMap((b) => [b.c, ...b.extra]), s1, s2, anon, other2].map((c) => c.end()))
console.log(failures ? `\n✖ ${failures} verificaciones fallaron` : '\n✔ Todas las verificaciones pasaron')
process.exit(failures ? 1 : 0)
