"""
Examen más visual (24/11): escenas de casos, tema por color, jaguar de avance, lista de faltantes al entregar
y pantalla del proyector con música de suspenso. Corre contra PostgreSQL local + fake_supabase + build QA en :4174.
"""
import json
import os
import re
import time

import psycopg
from playwright.sync_api import sync_playwright
from psycopg.types.json import Jsonb

BASE = 'http://localhost:4174/yaguarquiz/'
UID = '11111111-1111-1111-1111-111111111111'
OUT = os.environ.get('QA_OUT', '/tmp/qa-shots/')
os.makedirs(OUT, exist_ok=True)
db = psycopg.connect('host=/tmp port=5544 user=postgres dbname=t', autocommit=True)
results = []


def check(cid, case, ok, detail=''):
    results.append(ok)
    print(('  ✅ ' if ok else '  ❌ ') + f'{cid} {case}' + (f' — {detail}' if detail else ''))


def sql(q, a=()):
    with db.cursor() as c:
        c.execute('reset role')
        c.execute(q, a)
        return c.fetchall() if c.description else None


def call(fn, args, teacher=False):
    with db.cursor() as c:
        c.execute('reset role')
        c.execute('set role authenticated' if teacher else 'set role anon')
        c.execute("select set_config('request.jwt.claim.sub', %s, false)", [UID if teacher else ''])
        c.execute(f'select public.{fn}(' + ', '.join(f'{n} => %s' for n in args) + ')', [Jsonb(v) if isinstance(v, (dict, list)) else v for v in args.values()])
        r = c.fetchone()[0]
        c.execute('reset role')
        return r


if not sql("select 1 from public.subjects where code = 'DEMO 023'"):
    call('seed_demo_data', {}, True)
subj = sql("select id::text from public.subjects where code = 'DEMO 023' order by created_at limit 1")[0][0]
sql("update public.sessions set status = 'finished', phase = 'finished' where status <> 'finished'")
sql("delete from public.quizzes where title = 'Examen visual (prueba)'")
quiz = sql("insert into public.quizzes (teacher_id, subject_id, title, status) values (%s, %s, 'Examen visual (prueba)', 'published') returning id::text", [UID, subj])[0][0]
QS = [
    ('G1 · Redes y community management', '¿Qué debe hacer primero el community manager con este comentario?',
     {'kind': 'comment', 'page': 'Heladería Polar', 'author': 'Rosa T.', 'text': 'Fui ayer y estaba cerrado 😕'}, ['Responder hoy y disculparse', 'Borrarlo', 'Ignorarlo', 'Bloquear a Rosa']),
    ('G7 · Métricas y retorno', '¿Cuál es la frecuencia del anuncio?',
     {'kind': 'metrics', 'title': 'Anuncio · resultados', 'source': 'meta', 'rows': [{'label': 'Impresiones', 'value': '4.000'}, {'label': 'Alcance', 'value': '2.000'}]}, ['2', '4', '0,5', '6']),
    ('G6 · Buscadores: SEO y SEM', '¿Qué intención tiene esta búsqueda?', {'kind': 'search', 'query': 'helado a domicilio Cobija'}, ['Transaccional', 'Informativa', 'Navegacional', 'Ninguna']),
    ('G2 · Datos y ética digital', '¿Qué está mal en este formulario?',
     {'kind': 'form', 'title': 'Club de clientes', 'fields': ['Nombre'], 'check': {'label': 'Acepto recibir promociones', 'on': True}, 'button': 'Unirme'}, ['La casilla ya viene marcada', 'Pide el nombre', 'El botón es azul', 'Nada']),
    ('G5 · Email, copy y reseñas', '¿Cómo se llama este correo?',
     {'kind': 'email', 'from': 'Heladería Polar', 'subject': 'Confirma tu suscripción', 'text': 'Toca para confirmar.', 'button': 'Sí, confirmo'}, ['Doble confirmación', 'Spam', 'Rebote', 'Factura']),
    ('G3 · Estrategia, tácticas y SMART', '¿Cuál es una táctica?', None, ['Publicar un reel', 'Vender más', 'Ser los mejores', 'Crecer']),
]
for i, (tag, prompt, scene, opts) in enumerate(QS):
    qid = sql("""insert into public.questions (teacher_id, quiz_id, sort_order, type, prompt, tags, extra, base_points, time_limit_sec)
                 values (%s, %s, %s, 'single', %s, %s, %s, 1000, 30) returning id::text""",
              [UID, quiz, i, prompt, [tag], Jsonb({'scene': scene} if scene else {})])[0][0]
    for k, o in enumerate(opts):
        sql('insert into public.question_options (teacher_id, question_id, text, is_correct, sort_order) values (%s, %s, %s, %s, %s)', [UID, qid, o, k == 0, k])

now = time.time()
s = call('create_session', {'p_quiz': quiz, 'p_subject': subj, 'p_settings': {
    'mode': 'exam', 'identification': 'roster', 'require_ci': True, 'time_limit_min': 50, 'max_attempts': 1, 'show_correct': 'after_close',
    'opens_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(now - 60)), 'closes_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(now + 90 * 60))}}, True)
sid, pin = s['id'], s['pin']
st = sql("""select s.university_code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
            where e.subject_id = %s and s.ci is not null order by s.university_code limit 1""", [subj])[0]
ru, ci3 = st[0], ''.join(ch for ch in st[1] if ch.isdigit())[-3:]
payload = call('exam_state', {'p_token': None}) if False else None

sess = {'access_token': 'x.e30.y', 'refresh_token': 'r', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer',
        'user': {'id': UID, 'email': 'docente@ejemplo.bo', 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-11-17T00:00:00Z'}}
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- estudiante en la PC del laboratorio
    ctx = b.new_context(viewport={'width': 1366, 'height': 768})
    ctx.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    m = ctx.new_page()
    m.on('pageerror', lambda e: errs.append(str(e)))
    m.goto(BASE + f'#/play/{pin}')
    m.get_by_label('Tu RU').fill(ru)
    m.keyboard.press('Enter')
    m.get_by_label('Últimos 3 dígitos').fill(ci3)
    m.keyboard.press('Enter')
    m.wait_for_timeout(500)
    if m.get_by_role('button', name='Entrar').count():
        m.get_by_role('button', name='Entrar').click()
    try:
        m.get_by_role('button', name='Ahora no').click(timeout=6000)
    except Exception:
        pass
    m.wait_for_timeout(2500); m.screenshot(path=OUT + 'examen_visual_0.png', full_page=True)
    m.get_by_role('button', name=re.compile('^Comenzar')).click()
    m.get_by_text('Pregunta 1 de 6').wait_for(timeout=10000)
    m.wait_for_timeout(1500)
    shown = m.locator('figure').count()
    chip = m.get_by_text(re.compile(r'G\d · ')).count()
    m.screenshot(path=OUT + 'examen_visual_1.png', full_page=True)
    check('E1', 'La pregunta muestra su tema (G1…G7) con color y la escena del caso', shown >= 1 and chip >= 1, f'escenas={shown} tema={chip}')
    # responde 3 (la opción única avanza sola)
    for _ in range(3):
        m.locator('main button[aria-keyshortcuts]').first.click()
        m.wait_for_timeout(900)
    m.wait_for_timeout(800)
    m.screenshot(path=OUT + 'examen_visual_2.png')
    m.get_by_role('button', name=re.compile('^Pregunta 6')).click()
    m.wait_for_timeout(500)
    m.get_by_role('button', name='Revisar y entregar').click()
    dlg = m.get_by_role('dialog')
    dlg.get_by_text(re.compile('Te faltan')).wait_for(timeout=5000)
    m.wait_for_timeout(500)
    m.screenshot(path=OUT + 'examen_visual_entregar.png')
    check('E2', 'Al entregar ve qué números le faltan', dlg.get_by_text('4', exact=True).count() > 0 and dlg.get_by_text('6', exact=True).count() > 0)
    dlg.get_by_role('button', name='Cancelar').click()
    # ---------- docente: pantalla del proyector
    tc = b.new_context(viewport={'width': 1920, 'height': 1080})
    tc.add_init_script(f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)})); localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    t = tc.new_page()
    t.on('pageerror', lambda e: errs.append(str(e)))
    t.goto(BASE + f'#/host/{sid}')
    t.get_by_role('button', name='Proyectar').click()
    pj = t.get_by_role('dialog', name='Pantalla del examen para el proyector')
    pj.wait_for(timeout=8000)
    t.wait_for_timeout(2500)
    t.screenshot(path=OUT + 'examen_proyector.png')
    txt = pj.inner_text().lower()
    check('E3', 'El proyector muestra el reloj y cuántos responden (sin nombres)', 'tiempo que les queda' in txt and 'respondiendo' in txt and st[0].lower() not in txt, txt[:120].replace('\n', ' | '))
    # últimos minutos: se acerca el plazo del intento
    sql("update public.attempts set deadline = now() + interval '3 minutes' where session_id = %s and submitted_at is null", [sid])
    t.wait_for_timeout(4500)
    t.screenshot(path=OUT + 'examen_proyector_final.png')
    check('E4', 'En los últimos 5 minutos cambia a «Últimos minutos» (rojo)', 'últimos minutos' in pj.inner_text().lower())
    sql("update public.attempts set deadline = now() + interval '40 minutes' where session_id = %s and submitted_at is null", [sid])
    pj.get_by_role('button', name='Cerrar la pantalla del proyector').click()
    # ---------- se le colgó la PC: entra desde otro equipo
    c2 = b.new_context(viewport={'width': 1366, 'height': 768})
    c2.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    m2 = c2.new_page()
    m2.on('pageerror', lambda e: errs.append(str(e)))
    m2.goto(BASE + f'#/play/{pin}')
    m2.get_by_label('Tu RU').fill(ru)
    m2.keyboard.press('Enter')
    m2.get_by_label('Últimos 3 dígitos').fill(ci3)
    m2.keyboard.press('Enter')
    m2.wait_for_timeout(500)
    if m2.get_by_role('button', name='Entrar').count():
        m2.get_by_role('button', name='Entrar').click()
    m2.get_by_text(re.compile('ya está abierto en otro equipo')).wait_for(timeout=8000)
    m2.screenshot(path=OUT + 'examen_otro_equipo.png')
    check('E5', 'Desde otro equipo le dice que avise al docente (su RU está abierto en otra PC)', True)
    banner = t.get_by_role('alert').filter(has_text='otro equipo')
    banner.wait_for(timeout=8000)
    t.screenshot(path=OUT + 'examen_monitor_cambio.png')
    banner.get_by_role('button', name=re.compile('^Autorizar')).click()
    t.wait_for_timeout(1500)
    pend = sql('select takeover_pending, device_id is null from public.participants where session_id = %s and student_id is not null', [sid])[0]
    check('E6', 'El docente ve el aviso en el monitor y lo autoriza con un botón', pend == (False, True), str(pend))
    m2.get_by_role('button', name='Entrar').click()  # vuelve a tocar «Entrar»
    try:
        m2.get_by_role('button', name='Ahora no').click(timeout=4000)
    except Exception:
        pass
    m2.get_by_text(re.compile(r'respondidas')).first.wait_for(timeout=10000)
    m2.wait_for_timeout(800)
    top = m2.get_by_text(re.compile(r'^\d+/6')).first.inner_text()
    check('E7', 'En el otro equipo sigue donde se quedó (respuestas guardadas)', top.startswith('3/6'), top)
    b.close()
check('Z1', 'Sin errores de JavaScript', not errs, '; '.join(errs[:3]))
print(f'\nResultado: {sum(results)}/{len(results)}')
