"""
Prueba de punta a punta de las actividades (Fase 9) contra el servidor simulado (fake_supabase.py).
  A. Docente (PC 1366): crea un crucigrama desde la galería, pega las palabras desde Excel, genera el tablero,
     guarda, lo prueba y lo lanza como tarea.
  B. Estudiante (celular 390): entra con su RU, juega el crucigrama contra el servidor, recarga a mitad
     (no pierde el avance) y termina: la actividad se entrega sola con nota 100.
  C. Memoria y clasificar (creadas por SQL) jugadas por la interfaz contra el servidor.
  D. Ninguna respuesta del servidor al estudiante trae las palabras antes de resolverlas.
Uso: python3 tests/e2e/activities_flow.py   (requiere qa-up.sh: fake_supabase en :5555 y build QA en :4174)
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


def call(fn, args, teacher=True):
    with db.cursor() as c:
        c.execute('reset role')
        c.execute('set role authenticated' if teacher else 'set role anon')
        c.execute("select set_config('request.jwt.claim.sub', %s, false)", [UID if teacher else ''])
        c.execute(f'select public.{fn}(' + ', '.join(f'{n} => %s' for n in args) + ')',
                  [Jsonb(v) if isinstance(v, (dict, list)) else v for v in args.values()])
        r = c.fetchone()[0]
        c.execute('reset role')
        return r


WORDS = {'Capital del departamento de Pando': 'Cobija', 'Fruto amazónico que Bolivia más exporta': 'Castaña',
         'Felino más grande de América': 'Jaguar', 'Río que separa Cobija de Brasil': 'Acre',
         'Árbol del que se extrae el caucho': 'Siringa', 'Ciudad del Beni, capital de la castaña': 'Riberalta'}
sess = {'access_token': 'x.e30.y', 'refresh_token': 'r', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer',
        'user': {'id': UID, 'email': 'docente@ejemplo.bo', 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-11-17T00:00:00Z'}}

if not sql("select 1 from public.subjects where code = 'DEMO 023'"):
    call('seed_demo_data', {})
subj = sql("select id::text from public.subjects where code = 'DEMO 023' limit 1")[0][0]
sql("update public.sessions set status = 'finished', phase = 'finished' where status <> 'finished'")
sql("delete from public.quizzes where settings ? 'activity'")
open(LOG, 'w').close()
errs = []


def join(pg, pin, code, ci):
    pg.goto(BASE + f'#/play/{pin}')
    pg.wait_for_timeout(1500)
    pg.get_by_label('Tu RU').fill(code)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    if pg.get_by_label('Últimos 3 dígitos').count():
        pg.get_by_label('Últimos 3 dígitos').fill(ci)
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(500)
    if pg.get_by_role('button', name='Sí, soy yo').count():
        pg.get_by_role('button', name='Sí, soy yo').click()
    pg.get_by_role('button', name='Entrar').wait_for(timeout=8000)
    pg.get_by_role('button', name='Entrar').click()
    pg.get_by_role('button', name='Comenzar').wait_for(timeout=8000)


def stat(pg, title):
    return pg.locator(f'[title={title}]').first.inner_text().split('\n')[-1].strip()


with sync_playwright() as p:
    b = p.chromium.launch()
    # ======================================================================== A. docente
    print('\n== A. Docente: crear, editar, probar y lanzar un crucigrama (PC 1366)')
    tc = b.new_context(viewport={'width': 1366, 'height': 900})
    tc.add_init_script(f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)})); localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-intro-seen','1')")
    t = tc.new_page()
    t.on('pageerror', lambda e: errs.append(f'docente: {e}'))
    t.goto(BASE + '#/admin/actividades')
    t.wait_for_timeout(2500)
    t.screenshot(path=OUT + 'actividades-1-galeria.png')
    check('9.1', 'Galería con los 10 tipos de actividad', t.get_by_role('button', name=re.compile('Crucigrama')).count() > 0 and t.get_by_role('button', name=re.compile('Clasificar en grupos')).count() > 0)
    t.get_by_role('button', name=re.compile('^Crucigrama')).first.click()
    t.wait_for_timeout(500)
    t.get_by_label('Título').fill('Crucigrama de la Amazonía')
    t.get_by_label('Asignatura').select_option(subj)
    t.get_by_role('button', name='Crear y escribir las palabras').click()
    t.wait_for_timeout(2500)
    check('9.2', 'Al crear abre el editor de la actividad', '/admin/actividades/' in t.url, t.url.split('#')[-1])
    t.get_by_role('button', name='Pegar desde Excel').click()
    t.get_by_label('Filas a pegar').fill('\n'.join(f'{w}\t{c}' for c, w in WORDS.items()))
    t.get_by_role('button', name=re.compile('^Agregar 6')).click()
    t.wait_for_timeout(400)
    t.get_by_role('button', name='Generar otro tablero').click()
    t.wait_for_timeout(600)
    t.screenshot(path=OUT + 'actividades-2-editor.png', full_page=True)
    t.get_by_role('button', name='Guardar').click()
    t.wait_for_timeout(1500)
    qid = t.url.rsplit('/', 1)[-1]
    n_items = sql("select count(*) from public.questions where quiz_id = %s and type = 'game_item'", [qid])[0][0]
    lay = sql("select settings -> 'activity' -> 'layout' from public.quizzes where id = %s", [qid])[0][0]
    check('9.3', 'Pegar desde Excel + guardar: 6 palabras y tablero cruzado', n_items == 6 and lay and len(lay['words']) >= 5, f'{n_items} palabras, {len(lay["words"]) if lay else 0} en el tablero')
    t.get_by_role('button', name='Probar').click()
    t.wait_for_timeout(1200)
    t.screenshot(path=OUT + 'actividades-3-vista-previa.png')
    check('9.4', 'Vista previa jugable como estudiante', t.get_by_role('dialog').get_by_text('Horizontales').count() + t.get_by_role('dialog').get_by_text('Verticales').count() > 0)
    t.keyboard.press('Escape')
    t.wait_for_timeout(400)
    t.get_by_role('button', name='Lanzar').click()
    t.wait_for_timeout(1200)
    modal = t.get_by_role('dialog')
    check('9.5', 'Lanzar: solo tarea o laboratorio (sin modo en vivo)', modal.get_by_text('En vivo').count() == 0 and modal.get_by_text('Tarea / práctica').count() > 0)
    t.screenshot(path=OUT + 'actividades-4-lanzar.png')
    t.get_by_role('button', name='Programar y publicar').click()
    t.wait_for_timeout(2500)
    sid, pin, show = sql("select id::text, pin, show_correct from public.sessions where quiz_id = %s order by created_at desc limit 1", [qid])[0]
    check('9.6', 'Se publica como tarea con retroalimentación inmediata', show == 'each' and '/host/' in t.url, f'PIN {pin}')
    t.screenshot(path=OUT + 'actividades-5-monitor.png')

    # ======================================================================== B. estudiante
    print('\n== B. Estudiante en el celular: crucigrama contra el servidor, recarga a mitad')
    mc = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    mc.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-intro-seen','1')")
    m = mc.new_page()
    m.on('pageerror', lambda e: errs.append(f'celular: {e}'))
    join(m, pin, 'DEMO-001', '001')
    m.screenshot(path=OUT + 'actividades-6-inicio-estudiante.png')
    check('9.7', 'El estudiante ve “Actividad: Crucigrama” y la cantidad de palabras', 'crucigrama' in m.locator('main').inner_text().lower() and 'palabras' in m.locator('main').inner_text().lower())
    m.get_by_role('button', name='Comenzar').click()
    m.wait_for_timeout(2500)

    def solve(clue_text):
        m.locator('li button', has_text=clue_text).first.click()
        m.wait_for_timeout(250)
        m.keyboard.type(WORDS[clue_text].lower(), delay=35)
        m.keyboard.press('Enter')
        m.wait_for_timeout(1200)

    clues = list(WORDS)
    solve(clues[0])
    # error a propósito en la segunda palabra (se descuenta: acierta en el 2.º intento)
    m.locator('li button', has_text=clues[1]).first.click()
    m.wait_for_timeout(250)
    m.keyboard.type('xxxxxxx', delay=30)
    m.keyboard.press('Enter')
    m.wait_for_timeout(1200)
    solve(clues[1])
    before = stat(m, 'Resueltas')
    m.screenshot(path=OUT + 'actividades-7-crucigrama-celular.png')
    m.reload()
    m.wait_for_timeout(3500)
    after = stat(m, 'Resueltas')
    check('9.8', 'Recargar a mitad: sigue con su avance', before == after == '2/6', f'antes {before}, después {after}')
    for c in clues[2:]:
        solve(c)
    m.wait_for_timeout(3000)
    grade = sql("select grade from public.attempts a join public.sessions s on s.id = a.session_id where s.id = %s order by a.started_at desc limit 1", [sid])[0][0]
    body = m.locator('main').inner_text()
    m.screenshot(path=OUT + 'actividades-8-nota.png')
    check('9.9', 'Al resolver todo se entrega sola y muestra la nota', grade is not None and 'tu nota' in body.lower(), f'nota {grade} (5 al 1.er intento + 1 al 2.º = (5 + 0,6)/6)')
    check('9.10', 'Nota correcta con penalización por intento', grade is not None and abs(float(grade) - 93.33) < 0.01, grade)
    check('9.11', 'Revisión al terminar con cada palabra', 'revisión de crucigrama' in body.lower())

    # ======================================================================== C. memoria y clasificar
    print('\n== C. Memoria y clasificar contra el servidor (celular)')
    def make(kind, items, extra=None):
        q = sql("insert into public.quizzes (teacher_id, subject_id, title, status) values (%s, %s, %s, 'published') returning id::text", [UID, subj, f'Actividad {kind}'])[0][0]
        call('save_activity', {'p_quiz': q, 'p_activity': {'type': kind, **(extra or {})}, 'p_items': items})
        return call('create_session', {'p_quiz': q, 'p_subject': subj, 'p_settings': {'mode': 'homework', 'show_correct': 'each', 'max_attempts': 1}})
    MEM = [{'term': 'Excel', 'prompt': 'Hoja de cálculo'}, {'term': 'Word', 'prompt': 'Procesador de texto'}, {'term': 'Gmail', 'prompt': 'Correo electrónico'}]
    s_mem = make('memory', MEM)
    m2 = mc.new_page()
    join(m2, s_mem['pin'], 'DEMO-002', '002')
    m2.get_by_role('button', name='Comenzar').click()
    m2.wait_for_timeout(2500)
    cards = m2.locator('button[aria-label^="Carta"]')
    pairs = {x['term']: x['prompt'] for x in MEM}
    pairs.update({v: k for k, v in list(pairs.items())})
    known = {}

    def face(i):
        return cards.nth(i).get_attribute('aria-label', timeout=3000) or ''

    def flip(i):
        cards.nth(i).click(timeout=3000)
        m2.wait_for_timeout(700)
        return face(i).split(': ', 1)[-1]

    for _ in range(12):
        if not cards.count():
            break
        down = [i for i in range(cards.count()) if 'boca abajo' in face(i)]
        if not down:
            break
        # ¿hay una pareja ya conocida y boca abajo?
        pair = next(((a, c) for a in down for c in down if a < c and known.get(a) and pairs.get(known[a]) == known.get(c)), None)
        if pair:
            flip(pair[0]); flip(pair[1]); m2.wait_for_timeout(1200)
            continue
        a = next((i for i in down if i not in known), down[0])
        ta = flip(a); known[a] = ta
        c = next((i for i in down if i != a and known.get(i) == pairs.get(ta)), None) or next((i for i in down if i != a and i not in known), None)
        if c is None:
            break
        known[c] = flip(c)
        m2.wait_for_timeout(1300)
    m2.wait_for_timeout(2500)
    g2 = sql("select grade from public.attempts where session_id = %s", [s_mem['id']])
    check('9.12', 'Memoria contra el servidor: encuentra las 3 parejas y se entrega sola', g2 and g2[0][0] is not None and float(g2[0][0]) >= 50, f'nota {g2[0][0] if g2 else "—"}')

    CL = [{'term': 'Excel', 'prompt': 'Software', 'group': 'Software'}, {'term': 'Teclado', 'prompt': 'Hardware', 'group': 'Hardware'},
          {'term': 'Chrome', 'prompt': 'Software', 'group': 'Software'}, {'term': 'Monitor', 'prompt': 'Hardware', 'group': 'Hardware'}]
    s_cl = make('classify', CL)
    m3 = mc.new_page()
    join(m3, s_cl['pin'], 'DEMO-003', '003')
    m3.get_by_role('button', name='Comenzar').click()
    m3.wait_for_timeout(2500)
    # el primero, mal a propósito; luego todos bien
    m3.locator('button[aria-pressed]', has_text='Excel').first.click()
    m3.locator('button', has=m3.locator('span', has_text=re.compile('^Hardware$'))).first.click()
    m3.wait_for_timeout(1000)
    for it in CL:
        loc = m3.locator('button[aria-pressed]', has_text=it['term'])
        if not loc.count():
            continue
        loc.first.click()
        m3.locator('button', has=m3.locator('span', has_text=re.compile('^' + it['group'] + '$'))).first.click()
        m3.wait_for_timeout(1000)
    m3.screenshot(path=OUT + 'actividades-9-clasificar.png')
    m3.wait_for_timeout(2500)
    g3 = sql("select grade from public.attempts where session_id = %s", [s_cl['id']])
    check('9.13', 'Clasificar contra el servidor: un error se descuenta (60 %) y se entrega sola', g3 and g3[0][0] is not None and abs(float(g3[0][0]) - 90) < 0.01, f'nota {g3[0][0] if g3 else "—"}')

    # ======================================================================== D. fugas
    print('\n== D. Lo que recibe el estudiante')
    leaks = 0
    n = 0
    for line in open(LOG):
        e = json.loads(line)
        if e['fn'] != 'activity_state' or not isinstance(e['res'], dict):
            continue
        cur = (e['res'].get('current') or {}).get('activity')
        if not cur or cur.get('type') != 'crossword':
            continue
        n += 1
        solved = {k for k, v in (cur.get('progress') or {}).items() if v.get('done')}
        # se excluye el texto de las pistas (lo escribe el docente y puede nombrar otras palabras)
        bd = dict(cur.get('board') or {})
        bd['words'] = [{k: v for k, v in w.items() if k != 'clue'} for w in bd.get('words', [])]
        board = json.dumps(bd, ensure_ascii=False).upper()
        for w in WORDS.values():
            if w.upper() in board:
                leaks += 1
    check('9.14', 'El tablero del crucigrama nunca trae las palabras', n > 0 and leaks == 0, f'{n} respuestas revisadas; filtraciones: {leaks}')
    check('9.QA', 'Sin errores de JavaScript', not errs, '; '.join(errs[:3]) or 'ninguno')
    b.close()

ok = sum(r['ok'] for r in results)
print(f'\nResultado: {ok}/{len(results)}')
json.dump(results, open('/tmp/activities_results.json', 'w'), ensure_ascii=False, indent=1)
raise SystemExit(0 if ok == len(results) else 1)
