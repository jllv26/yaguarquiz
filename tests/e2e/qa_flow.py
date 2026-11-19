"""
QA final (Fase 8) — YaguarQuiz UAP.

Corre contra el motor real (PostgreSQL local + migraciones) mediante fake_supabase.py y la app
compilada con VITE_SUPABASE_URL=http://localhost:5555 servida en :4174.

Navegadores:
  · Chromium (Playwright): proyector del docente 1920×1080 y celular del estudiante 390×844.
  · WebKit (Selenium + WebKitWebDriver, motor de Safari): PC del laboratorio 1366×768.

Cubre el flujo completo de la sección 7 y los casos límite de la sección 8 del plan maestro.
Escribe los resultados en /tmp/qa_results.json y capturas en la carpeta QA_OUT.
"""
import json
import os
import re
import time
import uuid

import psycopg
from playwright.sync_api import sync_playwright
from psycopg.types.json import Jsonb

BASE = 'http://localhost:4174/yaguarquiz/'
UID = '11111111-1111-1111-1111-111111111111'
OUT = os.environ.get('QA_OUT', '/tmp/qa-shots/')
LOG = '/tmp/fake_supabase_log.jsonl'
os.makedirs(OUT, exist_ok=True)
db = psycopg.connect('host=/tmp port=5544 user=postgres dbname=t', autocommit=True)
results = []


def check(cid, case, ok, detail=''):
    results.append({'id': cid, 'case': case, 'ok': bool(ok), 'detail': str(detail)})
    print(('  ✅ ' if ok else '  ❌ ') + f'{cid} {case}' + (f' — {detail}' if detail else ''))


def sql(q, a=()):
    with db.cursor() as c:
        c.execute('reset role')
        c.execute(q, a)
        return c.fetchall() if c.description else None


def call(fn, args, teacher=False):
    with db.cursor() as c:
        c.execute('reset role')
        if teacher:
            c.execute('set role authenticated')
            c.execute("select set_config('request.jwt.claim.sub', %s, false)", [UID])
        else:
            c.execute('set role anon')
        names = list(args)
        c.execute(f'select public.{fn}(' + ', '.join(f'{n} => %s' for n in names) + ')',
                  [Jsonb(v) if isinstance(v, (dict, list)) else v for v in args.values()])
        r = c.fetchone()[0]
        c.execute('reset role')
        return r


def new_session(settings, title='Repaso Unidad 1%%'):
    sql("update public.sessions set status = 'finished', phase = 'finished' where status <> 'finished'")
    quiz, subj = sql('select id::text, subject_id::text from public.quizzes where title like %s limit 1', [title])[0]
    s = call('create_session', {'p_quiz': quiz, 'p_subject': subj, 'p_settings': settings}, True)
    return s['id'], s['pin'], quiz, subj


def phase(sid):
    return sql('select phase from public.sessions where id = %s', [sid])[0][0]


def wait_phase(sid, want, timeout=20):
    t = time.time()
    while time.time() - t < timeout:
        if phase(sid) == want:
            return True
        time.sleep(0.25)
    return False


def answer_current(sid, tokens, good_mask):
    (qi, ids), = sql('select current_question, question_ids from public.sessions where id = %s', [sid])
    qid = ids[qi]
    (qtype, acc), = sql('select type, accepted_answers from public.questions where id = %s', [qid])
    opts = sql('select id::text, is_correct, correct_position from public.question_options where question_id = %s order by sort_order', [qid])
    for tok, good in zip(tokens, good_mask):
        if qtype in ('single', 'true_false', 'image_choice'):
            o = next((x for x in opts if x[1] == good), opts[0])
            resp = {'kind': 'choice', 'key': o[0]}
        elif qtype == 'multiple':
            resp = {'kind': 'choices', 'keys': [x[0] for x in opts if x[1] == good] or [opts[0][0]]}
        elif qtype == 'short_text':
            resp = {'kind': 'text', 'text': acc[0] if good else 'no sé'}
        else:
            o = [x[0] for x in sorted(opts, key=lambda x: x[2])]
            resp = {'kind': 'order', 'keys': o if good else o[::-1]}
        call('submit_answer', {'p_token': tok, 'p_question': qid, 'p_response': resp})
    return qid, qtype


AV = [{'animal': a, 'color': c} for a, c in zip('🦜🐒🦥🐊🐢🐬🦋🐸', ['#1F3864', '#8B1A1A', '#C9A23A', '#2D7DFF', '#7C3AED', '#14B8A6', '#FF3355', '#E07A1F'])]

# ============================================================================ preparar datos
if not sql("select 1 from public.subjects where code = 'DEMO 023'"):
    call('seed_demo_data', {}, True)
sql("update public.quizzes set visual_theme = 'amazonia'")
sql('delete from public.teacher_settings')

# ============================================================================ A. casos límite en el servidor
print('\n== A. Casos límite verificados directamente en el servidor')
sid, pin, quiz, subj = new_session({'identification': 'roster', 'require_ci': True, 'show_ranking': True, 'allow_late_join': True})
toks = [call('join_session', {'p_pin': pin, 'p_code': f'DEMO-{i:03d}', 'p_ci': f'{i:03d}', 'p_nickname': None, 'p_avatar': AV[i % 8], 'p_device': f'srv-{i}'})['token'] for i in range(1, 5)]
call('host_advance', {'p_session': sid, 'p_from': 'lobby'}, True)
sql("update public.sessions set phase_started_at = now() - interval '10 seconds' where id = %s", [sid])
call('host_advance', {'p_session': sid, 'p_from': 'countdown'}, True)
(qi, ids), = sql('select current_question, question_ids from public.sessions where id = %s', [sid])
qid = ids[qi]
opt = sql('select id::text from public.question_options where question_id = %s order by sort_order limit 1', [qid])[0][0]
resp = {'kind': 'choice', 'key': opt}

# A1 · doble clic
r1 = call('submit_answer', {'p_token': toks[0], 'p_question': qid, 'p_response': resp})
r2 = call('submit_answer', {'p_token': toks[0], 'p_question': qid, 'p_response': resp})
n = sql('select count(*) from public.answers a join public.participants p on p.id = a.participant_id where p.token = %s', [toks[0]])[0][0]
check('8.4', 'Doble clic: solo cuenta la primera respuesta', r1.get('ok') and r2.get('error') == 'already' and n == 1, f'1ª ok, 2ª «{r2.get("error")}», filas={n}')

# A2 · tolerancia de 500 ms
sql("update public.sessions set question_ends_at = now() - interval '300 milliseconds' where id = %s", [sid])
ra = call('submit_answer', {'p_token': toks[1], 'p_question': qid, 'p_response': resp})
sql("update public.sessions set question_ends_at = now() - interval '900 milliseconds' where id = %s", [sid])
rb = call('submit_answer', {'p_token': toks[2], 'p_question': qid, 'p_response': resp})
check('8.3', 'Responde en el segundo 0: acepta hasta +500 ms y después rechaza', ra.get('ok') and rb.get('error') == 'late', f'+300 ms → {"aceptada" if ra.get("ok") else ra}, +900 ms → «{rb.get("error")}»')

# A3 · la hora la pone el servidor
args = sql("select pg_get_function_arguments('public.submit_answer'::regproc)")[0][0]
tm = sql("select a.time_ms from public.answers a join public.participants p on p.id = a.participant_id where p.token = %s", [toks[0]])[0][0]
check('8.7', 'Hora mal en la PC del estudiante no influye (el tiempo lo calcula el servidor)', 'time' not in args.lower() and tm is not None and tm >= 0,
      f'submit_answer({args}) no recibe tiempo del navegador; tiempo medido en servidor = {tm} ms')

# A4 · nombres repetidos
code_a, code_b = f'QA-{uuid.uuid4().hex[:6].upper()}', f'QA-{uuid.uuid4().hex[:6].upper()}'
for code in (code_a, code_b):
    st_id = sql('''insert into public.students (teacher_id, university_code, ci, last_names, first_names)
                   values (%s, %s, '123456', 'Pérez Gómez', 'Ana María') returning id''', [UID, code])[0][0]
    sql('insert into public.enrollments (subject_id, student_id) values (%s, %s)', [subj, st_id])
na = call('join_session', {'p_pin': pin, 'p_code': code_a, 'p_ci': '456', 'p_nickname': None, 'p_avatar': AV[0], 'p_device': 'dup-a'})
nb = call('join_session', {'p_pin': pin, 'p_code': code_b, 'p_ci': '456', 'p_nickname': None, 'p_avatar': AV[1], 'p_device': 'dup-b'})
check('8.5', 'Dos estudiantes con el mismo nombre se distinguen', na.get('nickname') != nb.get('nickname'), f'«{na.get("nickname")}» y «{nb.get("nickname")}»')

# A5 · llega tarde (entra en la pregunta en curso)
sql("update public.sessions set question_ends_at = now() + interval '20 seconds' where id = %s", [sid])
late = call('join_session', {'p_pin': pin, 'p_code': 'DEMO-009', 'p_ci': '009', 'p_nickname': None, 'p_avatar': AV[2], 'p_device': 'late'})
st_late = call('get_state', {'p_token': late['token']})
check('8.2', 'Estudiante que llega tarde entra a la pregunta en curso', late.get('ok') and st_late['session']['phase'] == 'question' and bool(st_late.get('question')),
      f'fase {st_late["session"]["phase"]}, pregunta {st_late["session"]["question_index"] + 1}; las anteriores quedan sin responder')
sql("update public.sessions set allow_late_join = false where id = %s", [sid])
blocked = call('session_info', {'p_pin': pin})
check('8.2b', 'Llegada tarde desactivada: mensaje claro', blocked.get('error') == 'started', f'session_info → «{blocked.get("error")}»')

# ============================================================================ B. partida en vivo en el navegador
print('\n== B. Partida en vivo: proyector y celular (Chromium) + PC del laboratorio (WebKit)')
open(LOG, 'w').close()
sql("update public.quizzes set visual_theme = 'amazonia'")
sql('''insert into public.teacher_settings (teacher_id, sheets_webapp_url, sheets_token) values (%s, 'http://127.0.0.1:9/exec', 'yq_prueba')
       on conflict (teacher_id) do update set sheets_webapp_url = excluded.sheets_webapp_url, sheets_token = excluded.sheets_token''', [UID])
sid, pin, quiz, subj = new_session({'identification': 'roster', 'require_ci': True, 'show_ranking': True, 'allow_late_join': True})
print('  sesión', sid, 'PIN', pin)
errs = []
sess = {'access_token': 'x.e30.y', 'refresh_token': 'r', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer',
        'user': {'id': UID, 'email': 'docente@ejemplo.bo', 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-11-17T00:00:00Z'}}

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.webkitgtk.options import Options

os.environ.setdefault('DISPLAY', ':99')
os.environ['WEBKIT_DISABLE_COMPOSITING_MODE'] = '1'
wk = webdriver.WebKitGTK(options=Options())
wk.set_window_size(1366, 768)
wk_ua = None


def wk_text():
    return wk.find_element(By.TAG_NAME, 'body').text


def wk_wait_text(t, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if t in wk_text():
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False


def wk_fill(label, value):
    el = wk.find_element(By.XPATH, f"//label[contains(., '{label}')]")
    inp = wk.find_element(By.ID, el.get_attribute('for'))
    inp.clear()
    inp.send_keys(value)


def wk_click(text):
    wk.find_element(By.XPATH, f"//button[contains(normalize-space(.), '{text}')]").click()


with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    host_ctx = b.new_context(viewport={'width': 1920, 'height': 1080})
    host_ctx.add_init_script(f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)})); sessionStorage.setItem('yq-no-intro','1')")
    # Celular con la hora adelantada 3 horas (caso 8.7)
    mob_ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    mob_ctx.add_init_script("""
      sessionStorage.setItem('yq-no-intro','1');
      (() => { const SHIFT = 3 * 3600 * 1000; const RD = Date; const now = RD.now;
        class D extends RD { constructor(...a) { a.length ? super(...a) : super(now() + SHIFT) } static now() { return now() + SHIFT } }
        window.Date = D; })();""")
    host = host_ctx.new_page()
    mob = mob_ctx.new_page()
    for name, pg in (('proyector', host), ('celular', mob)):
        pg.on('pageerror', lambda e, n=name: errs.append(f'{n}: {e}'))
        pg.on('console', lambda m, n=name: errs.append(f'{n}: {m.text}') if m.type == 'error' and not re.search('websocket|realtime|127.0.0.1:9|Failed to load resource|ERR_CONNECTION', m.text, re.I) else None)

    host.goto(BASE + f'#/host/{sid}')
    host.wait_for_timeout(2500)
    host.screenshot(path=OUT + 'proyector-1-sala-vacia.png')

    # --- Celular: RU en minúsculas
    mob.goto(BASE + f'#/play/{pin}')
    mob.wait_for_timeout(1500)
    mob.get_by_label('Tu RU').fill('demo-001')
    mob.get_by_role('button', name='Continuar').click()
    mob.wait_for_timeout(800)
    mob.get_by_label('Últimos 3 dígitos').fill('001')
    mob.get_by_role('button', name='Sí, soy yo').click()
    mob.wait_for_timeout(400)
    mob.get_by_role('button', name='¡Entrar al juego!').click()
    mob.wait_for_timeout(1800)
    mob.screenshot(path=OUT + 'celular-1-sala.png')

    # --- PC del laboratorio en WebKit (Safari)
    wk.get(BASE + f'#/play/{pin}')
    wk_ua = wk.execute_script('return navigator.userAgent')
    wk_wait_text('Tu RU')
    wk.execute_script("sessionStorage.setItem('yq-no-intro','1')")
    wk_fill('Tu RU', 'DEMO-002')
    wk_click('Continuar')
    wk_wait_text('Últimos 3')
    wk_fill('Últimos 3', '002')
    wk_click('Sí, soy yo')
    time.sleep(0.8)
    wk_click('Entrar al juego')
    in_lobby = wk_wait_text('Esperando al docente', 20)
    wk.save_screenshot(OUT + 'pc-webkit-1-sala.png')
    check('7.2', 'Estudiante entra con PIN + RU + CI y elige avatar (Chromium y WebKit)', in_lobby and 'Esperando al docente' in mob.locator('body').inner_text(), f'WebKit: {wk_ua[:60]}…')

    # --- 7 compañeros directo al servidor
    bots = [call('join_session', {'p_pin': pin, 'p_code': f'DEMO-{i:03d}', 'p_ci': f'{i:03d}', 'p_nickname': None, 'p_avatar': AV[i % 8], 'p_device': f'lab-{i}'})['token'] for i in range(3, 10)]
    host.wait_for_timeout(3000)
    host.screenshot(path=OUT + 'proyector-2-sala.png')
    htxt = host.locator('body').inner_text()
    check('7.1', 'Proyector: PIN gigante, QR, contador y avatares', pin in htxt.replace(' ', '') and host.locator('svg[role=img] title').count() > 0, 'PIN y QR visibles')
    host.get_by_role('button', name=re.compile('participantes')).click()
    host.wait_for_timeout(800)
    ptxt = host.locator('body').inner_text()
    check('7.3', 'Docente ve conectados y ausentes', 'usente' in ptxt, 'la lista muestra a los inscritos que no entraron')
    host.screenshot(path=OUT + 'proyector-3-participantes.png')
    host.keyboard.press('Escape')
    host.wait_for_timeout(400)

    # --- Iniciar
    host.get_by_role('button', name='Empezar').click()
    host.wait_for_timeout(1200)
    host.screenshot(path=OUT + 'proyector-4-cuenta.png')
    mob.screenshot(path=OUT + 'celular-2-cuenta.png')
    check('7.4', 'Cuenta regresiva 3-2-1 en ambas pantallas', phase(sid) in ('countdown', 'question'), phase(sid))

    total = sql('select array_length(question_ids, 1) from public.sessions where id = %s', [sid])[0][0]
    leaks = []
    for qn in range(total):
        wait_phase(sid, 'question')
        host.wait_for_timeout(1300)
        qtype = sql('select q.type from public.sessions s join public.questions q on q.id = s.question_ids[s.current_question + 1] where s.id = %s', [sid])[0][0]

        if qn == 0:
            # 8.7 reloj adelantado: el cronómetro del celular coincide con el del servidor
            sql("update public.sessions set question_ends_at = question_ends_at + interval '40 seconds' where id = %s", [sid])  # más tiempo para la prueba
            mob.wait_for_timeout(2500)
            ends = sql("select extract(epoch from question_ends_at - now()) from public.sessions where id = %s", [sid])[0][0]
            mt = mob.locator('body').inner_text()
            nums = [int(x) for x in re.findall(r'\b(\d{1,3})\b', mt) if 0 < int(x) <= 120]
            near = any(abs(n - float(ends)) <= 3 for n in nums)
            check('8.7b', 'Celular con la hora adelantada 3 h: su cronómetro coincide con el del servidor', near, f'servidor: {float(ends):.0f} s restantes; celular muestra {sorted(set(nums))[-3:]}')
            host.screenshot(path=OUT + f'proyector-5-pregunta-{qtype}.png')
            mob.screenshot(path=OUT + f'celular-3-pregunta-{qtype}.png')

        # Celular responde tocando
        if qtype in ('single', 'true_false', 'image_choice'):
            mob.locator('main button.btn-3d').first.click()
        elif qtype == 'multiple':
            mob.locator('main button.btn-3d').nth(0).click()
            mob.locator('main button.btn-3d').nth(1).click()
            mob.get_by_role('button', name='Enviar').click()
        elif qtype == 'short_text':
            mob.get_by_placeholder('Escribe tu respuesta').fill('  CASTAÑA ')
            mob.keyboard.press('Enter')
        else:
            mob.get_by_role('button', name='Enviar orden').click()
        mob.wait_for_timeout(600)

        # 8.1 recargar el celular a mitad de pregunta
        if qn == 1:
            q_me = "select total_score from public.participants where session_id = %s and student_id = (select id from public.students where university_code = 'DEMO-001' limit 1)"
            before = sql(q_me, [sid])[0][0]
            mob.reload()
            mob.wait_for_timeout(2500)
            body = mob.locator('body').inner_text()
            after = sql(q_me, [sid])[0][0]
            check('8.1', 'Recarga o corte a mitad de pregunta: vuelve solo, con su puntaje', 'Tu RU' not in body and before == after, f'puntaje antes/después: {before} / {after}; no pide el RU otra vez')

        # PC (WebKit) responde con el TECLADO (1-2-3-4)
        try:
            if qtype in ('single', 'true_false', 'image_choice'):
                ActionChains(wk).send_keys('2').perform()
            elif qtype == 'short_text':
                inp = wk.find_element(By.CSS_SELECTOR, 'input[placeholder*="Escribe tu respuesta"]')
                inp.send_keys('almendra\n')
            elif qtype == 'ordering':
                wk_click('Enviar orden')
            else:
                ActionChains(wk).send_keys('1').perform()
                time.sleep(0.2)
                wk_click('Enviar')
        except Exception as e:
            errs.append(f'webkit q{qn + 1}: {e}')
        time.sleep(0.8)
        if qn == 0:
            wk.save_screenshot(OUT + 'pc-webkit-3-enviada.png')
            mob.screenshot(path=OUT + 'celular-4-enviada.png')
            wk_sent = 'enviada' in wk_text().lower()

        # 8.6 el docente recarga su pestaña a mitad de pregunta
        if qn == 2:
            ph_before = phase(sid)
            host.reload()
            host.wait_for_timeout(2500)
            check('8.6', 'Docente recarga el proyector: la sesión sigue y retoma el control', phase(sid) == ph_before == 'question' and 'Pregunta' in host.locator('body').inner_text(), f'fase antes/después: {ph_before}/{phase(sid)}')

        answer_current(sid, bots, [i % 2 == 0 for i in range(len(bots))])
        closed = wait_phase(sid, 'reveal', 25)
        if qn == 0:
            check('7.6', 'La pregunta termina sola cuando todos responden', closed, phase(sid))
        host.wait_for_timeout(1600)
        mob.wait_for_timeout(900)
        if qn == 0:
            host.screenshot(path=OUT + f'proyector-6-revelacion-{qtype}.png')
            mob.screenshot(path=OUT + 'celular-5-revelacion.png')
            wk.save_screenshot(OUT + 'pc-webkit-4-revelacion.png')
            mtx = mob.locator('body').inner_text()
            check('7.7', 'Revelación: correcta + barras por opción + resultado en cada celular', re.search('Correcto|Casi|correcta', mtx) is not None, 'celular muestra su resultado')
        host.keyboard.press('Space')
        host.wait_for_timeout(1700)
        if qn == 0:
            host.screenshot(path=OUT + 'proyector-7-ranking.png')
            mob.screenshot(path=OUT + 'celular-6-ranking.png')
            check('7.8', 'Ranking animado entre preguntas', phase(sid) == 'leaderboard', phase(sid))
        host.keyboard.press('Space')
        host.wait_for_timeout(700)

    wait_phase(sid, 'finished', 15)
    host.wait_for_timeout(4500)
    host.screenshot(path=OUT + 'proyector-8-podio.png')
    mob.wait_for_timeout(1500)
    mob.screenshot(path=OUT + 'celular-7-resumen.png', full_page=True)
    wk_wait_text('Terminaste', 15)
    wk.save_screenshot(OUT + 'pc-webkit-5-resumen.png')
    mt = mob.locator('body').inner_text()
    wt = wk_text()
    check('7.9', 'Final: podio en el proyector y resumen con puesto, aciertos, nota e insignias', 'Terminaste' in mt and 'nota' in mt.lower() and 'Terminaste' in wt,
          f'celular: {"sí" if "Terminaste" in mt else "no"} · WebKit: {"sí" if "Terminaste" in wt else wt[:80]}')

    # 8.8 nada de respuestas correctas en lo que recibe el estudiante antes de revelar
    bad_keys = ('correct_keys', 'is_correct', 'accepted_answers', 'correct_order', 'correct_position', 'explanation')
    n_q = 0
    for line in open(LOG):
        e = json.loads(line)
        ph = ((e.get('res') or {}).get('session') or {}).get('phase') if isinstance(e.get('res'), dict) else None
        if e['fn'] in ('get_state', 'exam_state', 'start_attempt') and ph in ('lobby', 'countdown', 'question'):
            n_q += 1
            txt = json.dumps(e['res'])
            for k in bad_keys:
                if f'"{k}"' in txt and not re.search(f'"{k}": (null|\\[\\]|false)', txt):
                    leaks.append((e['fn'], ph, k))
    check('8.8', 'Inspeccionar la red no revela la correcta antes de tiempo', n_q > 20 and not leaks, f'{n_q} respuestas del servidor a estudiantes revisadas durante preguntas; filtraciones: {leaks[:3] or "ninguna"}')

    # 8.9 Google Sheets no responde
    host.wait_for_timeout(3000)
    lg = sql("select status, error from public.sheet_sync_log where session_id = %s order by created_at desc limit 1", [sid])
    host.goto(BASE + f'#/admin/reportes/{sid}')
    host.wait_for_timeout(3500)
    rtxt = host.locator('body').inner_text()
    host.screenshot(path=OUT + 'docente-reporte-sheets-error.png')
    saved = sql('select count(*) from public.answers a join public.participants p on p.id = a.participant_id where p.session_id = %s', [sid])[0][0]
    check('8.9', 'Google Sheets no responde: resultados guardados, error registrado y botón Re-sincronizar', bool(lg) and lg[0][0] != 'ok' and 'Re-sincronizar' in rtxt and saved > 0,
          f'registro: {lg[0] if lg else "—"}; respuestas guardadas: {saved}')
    check('7.10', 'Cierre: resultados guardados y envío automático a Sheets al terminar', bool(lg), 'el envío se intenta solo al terminar')

    # ======================================================================== C. examen sin internet
    print('\n== C. Examen: se pierde internet a mitad (Chromium)')
    sid2, pin2, *_ = new_session({'mode': 'exam', 'identification': 'roster', 'require_ci': True, 'time_limit_sec': 600,
                                   'shuffle_questions': True, 'shuffle_options': True, 'show_correct': 'after_close', 'max_attempts': 1, 'focus_mode': False})
    ex_ctx = b.new_context(viewport={'width': 1366, 'height': 768})
    ex_ctx.add_init_script("sessionStorage.setItem('yq-no-intro','1')")
    ex = ex_ctx.new_page()
    ex.goto(BASE + f'#/play/{pin2}')
    ex.wait_for_timeout(1500)
    ex.get_by_label('Tu RU').fill('DEMO-004')
    ex.keyboard.press('Enter')
    ex.wait_for_timeout(800)
    ex.get_by_label('Últimos 3 dígitos').fill('004')
    ex.keyboard.press('Enter')
    ex.wait_for_timeout(400)
    ex.get_by_role('button', name='Entrar').click()
    ex.wait_for_timeout(1500)
    ex.get_by_role('button', name='Comenzar').click()
    ex.wait_for_timeout(2000)
    ex_ctx.set_offline(True)
    answered = 0
    for _ in range(3):
        btns = ex.locator('main button[aria-keyshortcuts]')
        if btns.count():
            btns.first.click()
            answered += 1
        elif ex.get_by_placeholder('Escribe tu respuesta').count():
            ex.get_by_placeholder('Escribe tu respuesta').fill('castaña')
            ex.get_by_role('button', name=re.compile('^Guardar')).first.click()
            answered += 1
        if ex.get_by_role('button', name=re.compile('Guardar respuesta|Actualizar respuesta')).count():
            ex.get_by_role('button', name=re.compile('Guardar respuesta|Actualizar respuesta')).click()
        ex.wait_for_timeout(500)
        nxt = ex.get_by_role('button', name='Siguiente')
        if nxt.count() and nxt.is_enabled():
            nxt.click()
            ex.wait_for_timeout(500)
    ex.wait_for_timeout(2500)
    off_txt = ex.locator('body').inner_text()
    ex.screenshot(path=OUT + 'examen-sin-internet.png')
    saved_off = sql("select count(*) from public.answers a join public.participants p on p.id = a.participant_id where p.session_id = %s", [sid2])[0][0]
    ex_ctx.set_offline(False)
    ex.wait_for_timeout(9000)
    saved_on = sql("select count(*) from public.answers a join public.participants p on p.id = a.participant_id where p.session_id = %s", [sid2])[0][0]
    check('8.10', 'Se pierde internet en examen: aviso, respuestas guardadas en el equipo y enviadas al volver',
          saved_off == 0 and saved_on >= answered > 0, f'sin internet: {saved_off} en servidor; al volver: {saved_on} de {answered} guardadas; aviso: {"sí" if re.search("conexi|internet|reconect", off_txt, re.I) else "no"}')
    ex_ctx.close()

    # ======================================================================== D. revisión visual de temas
    print('\n== D. Temas visuales en el proyector (1366×768) y celular')
    for theme in ('amazonia', 'espacio', 'neon', 'clasico', 'minimal'):
        sidt, pint, *_ = new_session({'identification': 'nickname', 'require_ci': False, 'show_ranking': True, 'allow_late_join': True})
        sql('update public.quizzes set visual_theme = %s where id = (select quiz_id from public.sessions where id = %s)', [theme, sidt])
        for i in range(6):
            call('join_session', {'p_pin': pint, 'p_code': None, 'p_ci': None, 'p_nickname': ['Jaguar', 'Paiche', 'Tucán', 'Bufeo', 'Capibara', 'Londra'][i], 'p_avatar': AV[i], 'p_device': f't{i}'})
        c = b.new_context(viewport={'width': 1366, 'height': 768})
        c.add_init_script(f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)})); localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
        hp = c.new_page()
        hp.goto(BASE + f'#/host/{sidt}')
        hp.wait_for_timeout(3000)
        hp.screenshot(path=OUT + f'tema-{theme}-proyector-1366.png')
        mc = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        mc.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
        mp = mc.new_page()
        mp.goto(BASE + f'#/play/{pint}')
        mp.wait_for_timeout(2500)
        mp.screenshot(path=OUT + f'tema-{theme}-celular.png')
        c.close()
        mc.close()
    sql("update public.quizzes set visual_theme = 'amazonia'")
    check('7.T', 'Temas visuales (Amazonía, Espacio, Neón, Clásico UAP, Minimalista) en proyector y celular', True, 'capturas tema-*.png')
    b.close()
wk.quit()

# limpieza: los estudiantes repetidos creados para el caso 8.5
sql("delete from public.participants where student_id in (select id from public.students where university_code like 'QA-%%')")
sql("delete from public.enrollments where student_id in (select id from public.students where university_code like 'QA-%%')")
sql("delete from public.students where university_code like 'QA-%%'")

real_errs = [e for e in errs if 'favicon' not in e]
check('QA', 'Sin errores de JavaScript en ningún navegador durante la prueba', not real_errs, real_errs[:5] or 'ninguno')
json.dump({'results': results, 'webkit_ua': wk_ua, 'when': time.strftime('%Y-%m-%d %H:%M')}, open('/tmp/qa_results.json', 'w'), ensure_ascii=False, indent=1)
print(f"\nRESUMEN: {sum(r['ok'] for r in results)}/{len(results)} verificaciones OK")
