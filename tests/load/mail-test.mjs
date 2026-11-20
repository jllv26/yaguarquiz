// Prueba de los correos a estudiantes (0013) y del ingreso sin CI registrado (0012), contra PostgreSQL local.
// Uso: node tests/load/mail-test.mjs
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
const { rows: [quiz] } = await admin.query(`select id from public.quizzes where title like 'Repaso Unidad 1%' limit 1`)
const { rows: st } = await admin.query(
  `select s.id, s.university_code code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
    where e.subject_id = $1 order by s.university_code limit 4`, [subj.id])

console.log('▶ Ingreso sin CI registrado (0012)')
await admin.query(`update public.students set ci = null where id = $1`, [st[3].id])
const exam = await rpc(host, 'create_session', [quiz.id, subj.id, JSON.stringify({ mode: 'exam', require_ci: true })])
check((await rpc(anon, 'lookup_student', [exam.pin, st[3].code])).require_ci === false, 'al buscar su RU, no se le pide CI (no tiene)')
check((await rpc(anon, 'lookup_student', [exam.pin, st[0].code])).require_ci === true, 'a quien tiene CI sí se le pide')
check((await rpc(anon, 'join_session', [exam.pin, st[3].code, null, null, '{}', 'pc-sin-ci'])).ok === true, 'entra solo con su RU')
check((await rpc(anon, 'join_session', [exam.pin, st[0].code, '999', null, '{}', 'pc-ci-malo'])).error === 'ci', 'quien tiene CI y lo escribe mal: rechazado')

console.log('▶ Correos (0013)')
await admin.query(`insert into public.teacher_settings (teacher_id, sheets_token, sheets_webapp_url) values ($1, 'tok_mail', 'https://script.google.com/macros/s/x/exec')
                   on conflict (teacher_id) do update set sheets_token = 'tok_mail', sheets_webapp_url = excluded.sheets_webapp_url`, [TEACHER])
await admin.query(`update public.students set email = null where teacher_id = $1`, [TEACHER])
await admin.query(`update public.students set email = 'a' || id::text || '@ejemplo.bo' where id = any($1)`, [[st[0].id, st[1].id]])
check((await rpc(anon, 'mail_pull', ['tok_mail', 50])).enabled === false, 'apagado: no envía nada')
let s0 = await rpc(host, 'mail_set', [true])
check(s0.enabled && s0.configured && s0.with_email === 2, 'se activa y cuenta estudiantes con correo')
const hw = await rpc(host, 'create_session', [quiz.id, subj.id, JSON.stringify({ mode: 'homework', max_attempts: 2 })])
check((await admin.query(`select count(*)::int n from public.mail_outbox where kind = 'assignment' and ref_id = $1`, [hw.id])).rows[0].n === 2, 'al lanzar la tarea: un aviso por cada estudiante con correo')
const ex2 = await rpc(host, 'create_session', [quiz.id, subj.id, JSON.stringify({ mode: 'exam', closes_at: new Date(Date.now() + 2 * 3600e3).toISOString() })])
check((await admin.query(`select count(*)::int n from public.mail_outbox where ref_id = $1`, [ex2.id])).rows[0].n === 0, 'un examen no manda aviso de tarea')

// el estudiante 0 hace la tarea; el 2 (sin correo) entra y deja su correo
const j0 = await rpc(anon, 'join_session', [hw.pin, st[0].code, null, null, '{}', 'pc-m0'])
await rpc(anon, 'start_attempt', [j0.token])
await rpc(anon, 'submit_attempt', [j0.token])
check((await admin.query(`select count(*)::int n from public.mail_outbox where kind = 'grade'`)).rows[0].n === 1, 'al entregar: su nota queda en cola')
const j2 = await rpc(anon, 'join_session', [hw.pin, st[2].code, null, null, '{}', 'pc-m2'])
check((await rpc(anon, 'student_email_needed', [j2.token])) === true, 'sin correo: se le pide al entrar')
check((await rpc(anon, 'student_set_email', [j2.token, 'no-es-correo'])).error === 'email', 'correo inválido: rechazado')
check((await rpc(anon, 'student_set_email', [j2.token, ' Nuevo@Ejemplo.BO '])).ok, 'deja su correo')
check((await admin.query(`select email from public.students where id = $1`, [st[2].id])).rows[0].email === 'nuevo@ejemplo.bo', 'se guarda en minúsculas')
check((await admin.query(`select count(*)::int n from public.mail_outbox where kind = 'assignment' and student_id = $1`, [st[2].id])).rows[0].n === 1, 'y recibe el aviso de la tarea abierta')
check((await rpc(anon, 'student_email_needed', [j2.token])) === false, 'ya no se le vuelve a pedir')

// examen: la nota sale recién al cerrar
const je = await rpc(anon, 'join_session', [ex2.pin, st[1].code, st[1].ci?.slice(-3) ?? null, null, '{}', 'pc-me'])
await rpc(anon, 'start_attempt', [je.token])
await rpc(anon, 'submit_attempt', [je.token])
const { rows: [eg] } = await admin.query(`select not_before > now() + interval '1 minute' as later from public.mail_outbox m join public.attempts a on a.id = m.ref_id where a.session_id = $1`, [ex2.id])
check(eg?.later === true, 'nota de examen: espera al cierre')

check((await rpc(anon, 'mail_pull', ['token-malo', 50])).error === 'token', 'el script con token equivocado no recibe nada')
const pull = await rpc(anon, 'mail_pull', ['tok_mail', 50])
const msgs = pull.messages
const m0 = msgs.find((m) => m.to.startsWith('a' + st[0].id))
check(msgs.length === 3, `un correo por estudiante (${msgs.length})`)
check(m0 && /Tu nota/.test(m0.subject) && !/Nueva tarea/.test(m0.subject), `quien ya hizo la tarea recibe solo su nota: «${m0?.subject}»`)
check(msgs.every((m) => /#\/aula\/DEMO023/.test(m.html)), 'cada correo lleva al aula (DEMO023), sin PIN por actividad')
check((await rpc(anon, 'mail_pull', ['tok_mail', 50])).messages.length === 0, 'lo ya entregado al script no se repite')
for (const m of msgs) await rpc(anon, 'mail_ack', ['tok_mail', m.ids, true])
const s1 = await rpc(host, 'mail_status', [])
check(s1.pending === 1 && s1.sent_today >= 1, `estado: ${s1.pending} en cola (la nota del examen), enviados hoy ${s1.sent_today}`)
await rpc(host, 'host_end', [ex2.id]).catch(() => admin.query(`update public.sessions set status = 'finished' where id = $1`, [ex2.id]))
await admin.query(`update public.sessions set status = 'finished' where id = $1`, [ex2.id])
const pull2 = await rpc(anon, 'mail_pull', ['tok_mail', 50])
check(pull2.messages.length === 1 && /Tu nota/.test(pull2.messages[0].subject), 'al cerrar el examen, su nota sale')
check(/permission denied/.test(await admin.query(`set role anon; select * from public.mail_outbox`).then(() => '', (e) => e.message)), 'un estudiante no puede leer la cola de correos')
await admin.query('reset role')

await Promise.all([admin.end(), host.end(), anon.end()])
console.log(failures ? `✖ ${failures} verificaciones fallaron` : '✓ Correos y CI opcional: todo correcto')
process.exit(failures ? 1 : 0)
