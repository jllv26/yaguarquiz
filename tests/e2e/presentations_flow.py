"""
Prueba de punta a punta de las exposiciones (Fase 10) contra el servidor simulado (fake_supabase.py).
  Docente (PC 1366): crea la exposición, pega los grupos desde Excel, guarda y va al control; pone en escena,
  califica, abre el proyector, ve resultados, descarga el Excel y pasa las notas a la libreta.
  Estudiantes (3 celulares 390): entran con el PIN desde la pantalla de inicio (se redirige a la exposición),
  RU + CI; el expositor ve «¡Es tu turno!», los demás califican los 5 criterios y explican su nota.
Uso: python3 tests/e2e/presentations_flow.py   (requiere qa-up.sh)
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
    results.append({'id': cid, 'case': case, 'ok': bool(ok), 'detail': str(detail)})
    print(('  ✅ ' if ok else '  ❌ ') + f'{cid} {case}' + (f' — {detail}' if detail else ''))


def sql(q, a=()):
    with db.cursor() as c:
        c.execute('reset role')
        c.execute(q, a)
        return c.fetchall() if c.description else None


def call(fn, args):
    with db.cursor() as c:
        c.execute('set role authenticated')
        c.execute("select set_config('request.jwt.claim.sub', %s, false)", [UID])
        c.execute(f'select public.{fn}(' + ', '.join(f'{n} => %s' for n in args) + ')', [Jsonb(v) if isinstance(v, (dict, list)) else v for v in args.values()])
        r = c.fetchone()[0]
        c.execute('reset role')
        return r


sess = {'access_token': 'x.e30.y', 'refresh_token': 'r', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer',
        'user': {'id': UID, 'email': 'docente@ejemplo.bo', 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-11-17T00:00:00Z'}}
if not sql("select 1 from public.subjects where code = 'DEMO 023'"):
    call('seed_demo_data', {})
subj = sql("select id::text from public.subjects where code = 'DEMO 023' limit 1")[0][0]
sql('delete from public.presentations')
sql("update public.sessions set status = 'finished', phase = 'finished' where status <> 'finished'")
errs = []
TOPICS = ['Redes sociales para negocios', 'El community manager', 'Meta Business Suite', 'Calendario de contenidos', 'Datos personales', 'Marketing de influencers']

with sync_playwright() as p:
    b = p.chromium.launch()
    tc = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    tc.add_init_script(f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)})); localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    t = tc.new_page()
    t.on('pageerror', lambda e: errs.append(f'docente: {e}'))

    print('\n== A. Docente: crear la exposición y armar los grupos')
    t.goto(BASE + '#/admin/exposiciones')
    t.wait_for_timeout(2000)
    t.get_by_role('button', name='Nueva exposición').first.click()
    t.wait_for_timeout(1500)
    t.get_by_label('Título', exact=True).fill('Exposiciones del tercer parcial')
    t.get_by_label('Asignatura', exact=True).select_option(subj)
    t.wait_for_timeout(1200)
    t.get_by_role('button', name='Pegar desde Excel').click()
    lines = [f'DEMO-{i:03d}\t{(i - 1) // 2 + 1}\t{TOPICS[i - 1]}\t1' for i in range(1, 7)]
    t.get_by_label('Filas a pegar').fill('RU\tGrupo\tTema\tDía\n' + '\n'.join(lines))
    t.get_by_role('button', name=re.compile('^Aplicar')).click()
    t.wait_for_timeout(500)
    t.get_by_role('button', name='Ordenar por grupo').click()
    t.wait_for_timeout(300)
    t.screenshot(path=OUT + 'expo-1-editor.png', full_page=True)
    head = t.locator('h2', has_text='Expositores').inner_text()
    check('10.1', 'Pegar desde Excel arma 6 expositores en 3 grupos', '6 en 3 grupo' in head, head)
    t.get_by_role('button', name='Guardar e ir al control').click()
    t.wait_for_timeout(3000)
    row = sql('select id::text, pin from public.presentations order by created_at desc limit 1')
    pid, pin = row[0]
    n_pres = sql('select count(*) from public.presentation_presenters where presentation_id = %s', [pid])[0][0]
    check('10.2', 'Se guarda con la rúbrica de la Copa y abre el control', '/expo-host/' in t.url and n_pres == 6, f'PIN {pin}')
    t.get_by_role('button', name='Abrir la sala').click()
    t.wait_for_timeout(1200)

    print('\n== B. Estudiantes entran desde la pantalla de inicio con el PIN')
    phones = {}
    for code in ['DEMO-001', 'DEMO-003', 'DEMO-007']:
        mc = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        mc.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
        m = mc.new_page()
        m.on('pageerror', lambda e, c=code: errs.append(f'{c}: {e}'))
        m.goto(BASE + f'#/play/{pin}')
        m.wait_for_url(re.compile(r'#/expo/'), timeout=10000)
        m.get_by_label('Tu RU').fill(code.lower())
        m.keyboard.press('Enter')
        m.get_by_label('Últimos 3 dígitos de tu CI').fill(code[-3:])
        m.get_by_role('button', name='Sí, soy yo').click()
        m.get_by_text('Tu misión de hoy').wait_for(timeout=8000)
        phones[code] = m
    phones['DEMO-003'].screenshot(path=OUT + 'expo-2-celular-sala.png')
    check('10.3', 'El PIN de inicio lleva a la exposición; entran con RU + CI', len(phones) == 3)
    t.wait_for_timeout(2500)
    check('10.4', 'El docente ve los presentes', '3 de' in t.locator('main').inner_text(), re.search(r'\d+ de \d+ estudiantes entraron', t.locator('main').inner_text()).group(0) if re.search(r'\d+ de \d+ estudiantes entraron', t.locator('main').inner_text()) else '')

    print('\n== C. En escena: el primero del grupo 1')
    t.get_by_role('button', name='Primer expositor').click()
    t.wait_for_timeout(4000)
    live1 = sql("select s.university_code from public.presentation_presenters pp join public.students s on s.id = pp.student_id where pp.presentation_id = %s and pp.state = 'live'", [pid])[0][0]
    me = phones['DEMO-001'].locator('main').inner_text()
    # el primero del grupo 1 puede ser DEMO-001 o DEMO-002 (orden alfabético)
    check('10.5', 'En el celular del grupo 1: «¡Es tu turno!» si expone, o «no lo calificas» si es su compañero', ('Es tu turno' in me) if live1 == 'DEMO-001' else ('no lo calificas' in me), f'expone {live1}')

    def evaluate(m, levels, why_extra, und_extra):
        m.get_by_role('button', name='Calificar ahora').click()
        m.wait_for_timeout(500)
        for lv in levels:
            m.get_by_role('radio', name=re.compile(lv)).first.click()
            m.wait_for_timeout(450)
        m.get_by_role('button', name='Me gustó que…').click()
        box = m.get_by_label('¿Por qué le pones esta nota?')
        box.press('End')
        box.type(why_extra)
        m.get_by_role('button', name='Entendí que…').click()
        box2 = m.get_by_label('¿Qué entendiste de su tema?')
        box2.press('End')
        box2.type(und_extra)
        m.screenshot(path=OUT + 'expo-3-explica.png')
        m.get_by_role('button', name=re.compile('^Enviar')).click()
        m.get_by_text('¡Evaluación enviada!').wait_for(timeout=6000)
        txt = m.get_by_role('dialog').inner_text()
        m.get_by_role('button', name='Volver a la agenda').click()
        return txt

    m3 = phones['DEMO-003']
    m3.wait_for_timeout(500)
    m3.get_by_role('button', name='Calificar ahora').click()
    m3.wait_for_timeout(400)
    m3.screenshot(path=OUT + 'expo-4-criterio.png')
    m3.get_by_role('button', name='Volver a la agenda').click()
    txt = evaluate(m3, ['Salvó el semestre', 'Salvó el semestre', 'Salvó el semestre', 'Se salva', 'Se salva'], 'explicó su caso con capturas', 'las redes se eligen según el público')
    check('10.6', 'Califica los 5 criterios y explica su nota (13/15 → 86,7)', '86,7' in txt, txt.replace('\n', ' ')[:80])
    evaluate(phones['DEMO-007'], ['Se salva'] * 5, 'habló claro pero leyó bastante', 'hay que elegir la red según el negocio')
    peer = sql('select count(*) from public.presentation_reviews where presentation_id = %s', [pid])[0][0]
    check('10.7', 'Las calificaciones llegan al servidor', peer == 2, f'{peer} calificaciones')
    mm = phones['DEMO-003'].locator('main').inner_text()
    check('10.8', 'La misión avanza (1 de 1) y el compañero queda «calificado»', '1\n/1' in mm or '1/1' in mm.replace('\n', ''), '')

    print('\n== D. Docente califica, siguiente expositor, proyector y resultados')
    t.get_by_role('button', name='Calificar', exact=True).click()
    t.wait_for_timeout(700)
    dlg = t.get_by_role('dialog')
    for rg in dlg.get_by_role('radiogroup').all():
        rg.get_by_role('radio').last.click()
    dlg.get_by_role('button', name=re.compile('^Guardar mi nota')).click()
    t.wait_for_timeout(1500)
    fin = call('presentation_host', {'p_id': pid})['presenters']
    f0 = next(x for x in fin if x['state'] == 'live')
    check('10.9', 'Nota final = 50 % docente + 50 % compañeros', f0['teacher'] == 100 and abs(float(f0['final']) - (50 + float(f0['peer_avg']) / 2)) < 0.02, f"docente {f0['teacher']}, compañeros {f0['peer_avg']}, final {f0['final']}")
    time.sleep(1)
    t.get_by_role('button', name='Siguiente expositor').first.click()
    t.wait_for_timeout(2500)
    t.get_by_role('button', name='Proyector').click()
    t.wait_for_timeout(1500)
    t.screenshot(path=OUT + 'expo-5-proyector.png')
    proj = t.get_by_role('dialog', name='Proyector de la exposición').inner_text()
    check('10.10', 'Proyector: PIN, QR y quién está en escena con su cronómetro', pin in proj and 'en el escenario' in proj.lower())
    t.keyboard.press('Escape')
    t.wait_for_timeout(600)
    durs = sql("select duration_sec from public.presentation_presenters where presentation_id = %s and state = 'done'", [pid])
    check('10.11', 'Al pasar al siguiente se guardó cuánto expuso el anterior', durs and durs[0][0] is not None and durs[0][0] >= 1, f'{durs[0][0] if durs else "—"} s')
    # el compañero del mismo grupo no puede calificar (DEMO-002 es del grupo 1; el que expone ahora es DEMO-002)
    m1 = phones['DEMO-001']
    m1.wait_for_timeout(3500)
    live2 = sql("select s.university_code from public.presentation_presenters pp join public.students s on s.id = pp.student_id where pp.presentation_id = %s and pp.state = 'live'", [pid])[0][0]
    t1 = m1.locator('main').inner_text()
    check('10.12', 'Segundo expositor (mismo grupo): el celular de DEMO-001 lo refleja', ('Es tu turno' in t1) if live2 == 'DEMO-001' else ('no lo calificas' in t1), f'expone {live2}')
    t.get_by_role('tab', name='Resultados').click()
    t.wait_for_timeout(1500)
    t.screenshot(path=OUT + 'expo-6-resultados.png', full_page=True)
    with t.expect_download(timeout=15000) as dl:
        t.get_by_role('button', name='Descargar Excel').click()
    check('10.13', 'Descarga el Excel de notas y comentarios', dl.value.suggested_filename.endswith('.xlsx'), dl.value.suggested_filename)
    sel = t.get_by_label('Categoría de la libreta').evaluate('e => e.options[e.selectedIndex].text')
    t.get_by_role('button', name='Enviar a la libreta').click()
    t.wait_for_timeout(1500)
    ms = sql('select count(*) from public.manual_scores m join public.grading_items gi on gi.id = m.grading_item_id where gi.category = %s', [sel.split(' · ')[1].split(' (')[0]])[0][0]
    check('10.14', 'Las notas pasan a la libreta', ms >= 1, f'{ms} nota(s) en «{sel}»')
    check('10.QA', 'Sin errores de JavaScript', not errs, '; '.join(errs[:3]) or 'ninguno')
    b.close()

ok = sum(r['ok'] for r in results)
print(f'\nResultado: {ok}/{len(results)}')
json.dump(results, open('/tmp/presentations_results.json', 'w'), ensure_ascii=False, indent=1)
raise SystemExit(0 if ok == len(results) else 1)
