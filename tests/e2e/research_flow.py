"""
Prueba de punta a punta de las INVESTIGACIONES y las versiones (0021) contra el servidor simulado.
  A. Estudiante (celular 390): entra a su aula, abre la investigación, ve SU caso, escribe sus respuestas
     (se guardan solas, siguen al recargar), no puede pegar texto y entrega: queda «en revisión».
  B. Docente (PC 1366): en el reporte de la sesión ve «Calificar investigaciones», lee la entrega con su caso,
     marca Cumple / A medias / No cumple y guarda: la nota aparece en el aula del estudiante.
  C. Crucigrama con versiones: dos estudiantes reciben crucigramas distintos en la pantalla.
Uso: python3 tests/e2e/research_flow.py   (fake_supabase en :5555 y build QA en :4174)
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


sess = {'access_token': 'x.e30.y', 'refresh_token': 'r', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer',
        'user': {'id': UID, 'email': 'docente@ejemplo.bo', 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-11-17T00:00:00Z'}}

if not sql("select 1 from public.subjects where code = 'DEMO 023'"):
    call('seed_demo_data', {})
subj, code = sql("select id::text, portal_code from public.subjects where code = 'DEMO 023' order by created_at limit 1")[0]
sql("update public.sessions set status = 'finished', phase = 'finished' where status <> 'finished'")
sql("delete from public.quizzes where settings ? 'activity'")
studs = sql("""select s.university_code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
               where e.subject_id = %s and s.ci is not null order by s.university_code limit 2""", [subj])
ci3 = lambda c: ''.join(ch for ch in c if ch.isdigit())[-3:]

CRIT = [{'title': 'Evidencia real', 'desc': 'Datos que se pueden comprobar'}, {'title': 'Usa los conceptos'}, {'title': 'Propuesta aplicable'}]
q = sql("insert into public.quizzes (teacher_id, subject_id, title, status) values (%s, %s, '🔎 Investigación de prueba', 'published') returning id::text", [UID, subj])[0][0]
call('save_activity', {'p_quiz': q, 'p_activity': {'type': 'research', 'min_words': 8, 'criteria': CRIT,
     'variants': [{'case': {'title': 'Heladería del centro', 'context': 'En invierno bajan las ventas.', 'tasks': ['Elige un negocio real.']}},
                  {'case': {'title': 'Taller de motos', 'context': 'Sus clientes son mototaxistas.'}}]},
     'p_items': [{'term': '¿Qué redes usa el negocio?', 'prompt': 'Revisa su perfil hoy.'}, {'term': '¿Qué mejorarías primero?', 'prompt': ''}]})
s_r = call('create_session', {'p_quiz': q, 'p_subject': subj, 'p_settings': {'mode': 'homework', 'max_attempts': 1}})

W = [{'term': t, 'prompt': 'Pista de ' + t} for t in ['Asunto', 'Rebote', 'Prompt', 'Boletin', 'Clics', 'Baja', 'Spam', 'Cupon', 'Firma', 'Aida']]
from subprocess import run
qc = sql("insert into public.quizzes (teacher_id, subject_id, title, status) values (%s, %s, '🏠 Crucigrama con versiones', 'published') returning id::text", [UID, subj])[0][0]
lay = lambda ws: {'rows': 3, 'cols': 12, 'words': [{'i': i, 'n': k + 1, 'row': k, 'col': 0, 'dir': 'across'} for k, i in enumerate(ws)]}
call('save_activity', {'p_quiz': qc, 'p_activity': {'type': 'crossword', 'tries': 3, 'layout': lay([0, 1, 2]),
     'variants': [{'layout': lay([0, 1, 2]), 'pos': [0, 1, 2]}, {'layout': lay([3, 4, 5]), 'pos': [3, 4, 5]}, {'layout': lay([6, 7, 8]), 'pos': [6, 7, 8]}]}, 'p_items': W})
s_c = call('create_session', {'p_quiz': qc, 'p_subject': subj, 'p_settings': {'mode': 'homework', 'max_attempts': 1}})
errs = []


def enter_aula(pg, ru, ci):
    pg.goto(BASE + f'#/aula/{code}')
    pg.wait_for_timeout(1500)
    if pg.get_by_label('Tu RU').count() == 0:  # ya había entrado en este celular
        pg.get_by_role('heading', name=re.compile('^Por hacer')).wait_for(timeout=10000)
        return
    pg.get_by_label('Tu RU').fill(ru)
    pg.keyboard.press('Enter')
    pg.get_by_label('Últimos 3 dígitos de tu CI').fill(ci)
    pg.keyboard.press('Enter')
    pg.get_by_role('heading', name=re.compile('^Por hacer')).wait_for(timeout=10000)


with sync_playwright() as p:
    b = p.chromium.launch()
    mc = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    mc.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    m = mc.new_page()
    m.on('pageerror', lambda e: errs.append(str(e)))
    enter_aula(m, studs[0][0], ci3(studs[0][1]))
    m.get_by_role('button', name='Investigar').click()
    m.wait_for_url('**/play/*', timeout=10000)
    m.get_by_role('button', name='Comenzar').click()
    m.get_by_text('Tu caso (a cada compañero le tocó otro)').wait_for(timeout=10000)
    case1 = m.locator('h2').filter(has_text=re.compile('Heladería|Taller')).first.inner_text()
    check('A1', 'Ve SU caso, las preguntas y cómo se califica', m.get_by_text('Así te califica tu docente').count() == 1 and m.locator('textarea').count() == 2, case1)
    t1 = m.locator('textarea').nth(0)
    t1.click()
    t1.type('La heladería tiene página de Facebook con 2.100 seguidores y publica dos veces por semana.', delay=5)
    m.locator('textarea').nth(1).click()
    m.locator('textarea').nth(1).type('Mejoraría las fotos de los productos y respondería los mensajes en menos de una hora.', delay=5)
    m.wait_for_timeout(2500)
    check('A2', 'Las respuestas se guardan solas («Guardado»)', m.get_by_text('Guardado').count() >= 2)
    # intento de pegar texto: se bloquea
    m.locator('textarea').nth(0).focus()
    m.evaluate("""() => { const t = document.querySelectorAll('textarea')[0]; const dt = new DataTransfer(); dt.setData('text/plain', 'TEXTO COPIADO DE INTERNET');
      t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }""")
    m.wait_for_timeout(600)
    check('A3', 'No se puede pegar texto', 'TEXTO COPIADO' not in m.locator('textarea').nth(0).input_value() and m.get_by_text('No se puede pegar texto').count() > 0)
    m.reload()
    m.locator('textarea').first.wait_for(timeout=10000)
    check('A4', 'Al recargar, sus respuestas siguen ahí', '2.100 seguidores' in m.locator('textarea').nth(0).input_value())
    m.screenshot(path=OUT + 'research_A_estudiante.png', full_page=True)
    m.get_by_role('button', name='Entregar').click()
    m.get_by_role('dialog').get_by_role('button', name='Entregar').click()
    m.get_by_text('¡Entregado!').wait_for(timeout=10000)
    check('A5', 'Entrega: «¡Entregado! Tu docente publicará la nota»', m.get_by_text('Tu docente publicará la nota').count() == 1)
    enter_aula(m, studs[0][0], ci3(studs[0][1]))
    check('A6', 'En su aula figura «Entregada · en revisión»', m.get_by_text('Entregada · en revisión').count() == 1)

    # ---------- B. Docente
    tc = b.new_context(viewport={'width': 1366, 'height': 900})
    tc.add_init_script(f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)})); localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    t = tc.new_page()
    t.on('pageerror', lambda e: errs.append(str(e)))
    t.goto(BASE + f"#/admin/reportes/{s_r['id']}")
    t.get_by_text('Su calificación').wait_for(timeout=15000)
    check('B1', 'El reporte abre «Calificar investigaciones» con la entrega, su caso y sus respuestas',
          t.get_by_text('Calificar investigaciones (1 pendientes)').count() == 1 and t.get_by_text('Caso: ' + case1).count() == 1 and t.get_by_text('2.100 seguidores', exact=False).count() > 0)
    for crit, lvl in [('Evidencia real', 'Cumple'), ('Usa los conceptos', 'A medias'), ('Propuesta aplicable', 'Cumple')]:
        t.get_by_role('radiogroup', name=crit).get_by_role('radio', name=re.compile(lvl)).click()
    t.get_by_label('Comentario').fill('Buen trabajo; usa más conceptos del tema.')
    t.screenshot(path=OUT + 'research_B_docente.png', full_page=True)
    t.get_by_role('button', name='Guardar nota').click()
    t.get_by_text('Nota: 83').wait_for(timeout=10000)
    g = sql("select a.grade from public.attempts a where a.session_id = %s", [s_r['id']])[0][0]
    check('B2', 'Cumple + A medias + Cumple → 5 de 6 = 83', round(float(g)) == 83, g)
    m.reload()
    m.get_by_role('heading', name=re.compile('^Por hacer')).wait_for(timeout=10000)
    m.wait_for_timeout(800)
    m.screenshot(path=OUT + 'research_B3_aula.png', full_page=True)
    check('B3', 'La nota aparece en el aula del estudiante', re.search(r'\b83\b', m.locator('main').inner_text()) is not None)

    # ---------- C. Crucigrama con versiones
    boards = []
    for k, (ru, ci) in enumerate(studs):
        cx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        cx.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
        pg = cx.new_page()
        enter_aula(pg, ru, ci3(ci))
        pg.get_by_text('🏠 Crucigrama con versiones').locator('xpath=ancestor::div[contains(@class,"flex-wrap")][1]').get_by_role('button', name='Hacer').click()
        pg.wait_for_url('**/play/*', timeout=10000)
        pg.get_by_role('button', name='Comenzar').click()
        pg.wait_for_timeout(2500)
        boards.append(' | '.join(sorted(set(re.findall(r'Pista de (\w+)', pg.locator('body').inner_text())))))
        if k == 0:
            pg.screenshot(path=OUT + 'research_C_crucigrama.png', full_page=True)
    check('C1', 'Dos estudiantes reciben crucigramas con palabras distintas', boards[0] and boards[1] and boards[0] != boards[1], ' / '.join(boards))
    b.close()

check('Z1', 'Sin errores de JavaScript', not errs, '; '.join(errs[:3]))
ok = sum(r['ok'] for r in results)
print(f'\nResultado: {ok}/{len(results)}')
raise SystemExit(0 if ok == len(results) else 1)
