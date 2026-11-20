// Prueba de «Mi aula» (0020): un solo código por asignatura y todas las actividades del estudiante.
// Uso: node tests/load/aula-test.mjs
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
const { rows: [quiz] } = await admin.query(`select id from public.quizzes where title like 'Repaso Unidad 1%' limit 1`)
const { rows: st } = await admin.query(
  `select s.id, s.university_code code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
    where e.subject_id = $1 order by s.university_code limit 3`, [subj.id])
await admin.query(`update public.students set ci = '1234567' where id = $1`, [st[0].id])
await admin.query(`update public.students set ci = null where id = $1`, [st[1].id])

console.log('▶ Código del aula')
check(subj.portal_code === 'DEMO023', `cada asignatura tiene su código legible (${subj.portal_code})`)
const { rows: [nw] } = await admin.query(
  `insert into public.subjects (teacher_id, period_id, code, name, parallel) select teacher_id, period_id, 'DEMO 023', 'Otra', 'B' from public.subjects where id = $1 returning portal_code`, [subj.id])
check(nw.portal_code === 'DEMO023B', `misma sigla en otro paralelo → ${nw.portal_code}`)
check((await rpc(anon, 'portal_lookup', ['nada99', null, null])).error === 'code', 'código inexistente: rechazado')
check((await rpc(anon, 'portal_lookup', ['demo023', null, null])).step === 'ru', 'el código no distingue mayúsculas y pide el RU')

console.log('▶ Ingreso del estudiante')
check((await rpc(anon, 'portal_lookup', ['DEMO023', '000000', null])).error === 'ru', 'RU que no está inscrito: rechazado')
check((await rpc(anon, 'portal_lookup', ['DEMO023', st[0].code, null])).step === 'ci', 'si tiene CI, se le piden los 3 últimos dígitos')
check((await rpc(anon, 'portal_lookup', ['DEMO023', st[0].code, '999'])).error === 'ci', 'CI equivocado: rechazado')
const sinCi = await rpc(anon, 'portal_lookup', ['DEMO023', st[1].code, null])
check(sinCi.step === 'list', 'sin CI registrado: entra solo con su RU')

console.log('▶ Sus actividades')
const soon = (h) => new Date(Date.now() + h * 3600e3).toISOString()
const hw1 = await rpc(host, 'create_session', [quiz.id, subj.id, JSON.stringify({ mode: 'homework', max_attempts: 2, closes_at: soon(48) })])
const hw2 = await rpc(host, 'create_session', [quiz.id, subj.id, JSON.stringify({ mode: 'homework', max_attempts: 1, opens_at: soon(24), closes_at: soon(72) })])
const live = await rpc(host, 'create_session', [quiz.id, subj.id, JSON.stringify({ mode: 'live' })])
let L = await rpc(anon, 'portal_lookup', ['DEMO023', st[0].code, '567'])
const ids = L.items.map((x) => x.id)
check(L.step === 'list' && ids.includes(hw1.id) && ids.includes(hw2.id), `ve todas sus tareas en un solo lugar (${L.items.length})`)
check(!ids.includes(live.id), 'los juegos en vivo no aparecen (se entra con el PIN del proyector)')
check(L.items[0].id === hw1.id && L.items[0].win === 'open' && L.items.find((x) => x.id === hw2.id).win === 'not_open', 'primero las abiertas; las que aún no abren se ven aparte')
// la hace desde el aula (el aula usa el PIN por dentro)
const it = L.items.find((x) => x.id === hw1.id)
const j = await rpc(anon, 'join_session', [it.pin, st[0].code, '567', null, '{}', 'pc-aula'])
await rpc(anon, 'start_attempt', [j.token])
L = await rpc(anon, 'portal_lookup', ['DEMO023', st[0].code, '567'])
check(L.items.find((x) => x.id === hw1.id).in_progress === true, 'queda «en curso» si la dejó a medias')
await rpc(anon, 'submit_attempt', [j.token])
L = await rpc(anon, 'portal_lookup', ['DEMO023', st[0].code, '567'])
const done = L.items.find((x) => x.id === hw1.id)
check(done.done === 1 && done.best !== null && done.max_attempts === 2, `hecha: 1 de 2 intentos, nota ${done.best}`)
const other = await rpc(anon, 'portal_lookup', ['DEMO023', st[2].code, st[2].ci ? st[2].ci.replace(/\D/g, '').slice(-3) : null])
check(other.items.find((x) => x.id === hw1.id)?.done === 0, 'cada estudiante ve solo lo suyo')

console.log('▶ El docente cambia el código')
check(/ya lo usa/.test(await err(host, 'portal_set_code', [subj.id, 'demo023b'])), 'no puede repetir el de otra asignatura')
check((await rpc(host, 'portal_set_code', [subj.id, 'mkt-2026'])).code === 'MKT2026', 'lo cambia (MKT2026)')
check((await rpc(anon, 'portal_lookup', ['MKT2026', null, null])).ok, 'el nuevo código funciona')

await Promise.all([admin.end(), host.end(), anon.end()])
console.log(failures ? `\n✖ ${failures} fallas` : '\n✓ Todo bien')
process.exit(failures ? 1 : 0)
