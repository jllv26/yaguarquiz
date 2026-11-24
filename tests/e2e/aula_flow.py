"""
Prueba de punta a punta de «Mi aula» (0020) contra el servidor simulado (fake_supabase.py).
  A. Docente (PC 1366): ve el código del aula en la asignatura y asigna 3 actividades de una vez.
  B. Estudiante (celular 390): entra al aula con su RU y 3 dígitos del CI (sin PIN), ve las 3 por hacer,
     abre una con un botón, la resuelve y vuelve: aparece hecha con su nota; recargar no le pide el RU otra vez.
  C. La página de inicio lleva al aula.
Uso: python3 tests/e2e/aula_flow.py   (fake_supabase en :5555 y build QA en :4174)
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
st = sql("""select s.university_code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
            where e.subject_id = %s and s.ci is not null order by s.university_code limit 1""", [subj])[0]
ru, ci3 = st[0], ''.join(ch for ch in st[1] if ch.isdigit())[-3:]

# 3 actividades de clasificar (fáciles de jugar por la interfaz)
CL = [{'term': 'Excel', 'prompt': 'Software', 'group': 'Software'}, {'term': 'Teclado', 'prompt': 'Hardware', 'group': 'Hardware'},
      {'term': 'Chrome', 'prompt': 'Software', 'group': 'Software'}, {'term': 'Monitor', 'prompt': 'Hardware', 'group': 'Hardware'}]
for k in range(3):
    q = sql("insert into public.quizzes (teacher_id, subject_id, title, status) values (%s, %s, %s, 'published') returning id::text", [UID, subj, f'Aula {k + 1} · Clasifica'])[0][0]
    call('save_activity', {'p_quiz': q, 'p_activity': {'type': 'classify'}, 'p_items': CL})
errs = []

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- A. Docente
    tc = b.new_context(viewport={'width': 1366, 'height': 900})
    tc.add_init_script(f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)})); localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    t = tc.new_page()
    t.on('pageerror', lambda e: errs.append(str(e)))
    t.goto(BASE + f'#/admin/asignaturas/{subj}')
    t.get_by_text('Aula de los estudiantes').wait_for(timeout=15000)
    check('A1', f'La asignatura muestra el código del aula ({code})', t.get_by_text(code, exact=True).count() > 0)
    t.get_by_role('button', name='Asignar actividades').click()
    dlg = t.get_by_role('dialog')
    dlg.get_by_text('Aula 1 · Clasifica').wait_for(timeout=8000)
    dlg.get_by_role('button', name='Todas las no asignadas').click()
    dlg.get_by_role('radio', name='🏠 Práctica para casa').click()
    t.screenshot(path=OUT + 'aula_A_asignar.png')
    dlg.get_by_role('button', name='Asignar 3 actividades').click()
    t.get_by_text('3 actividades asignadas').wait_for(timeout=15000)
    n = sql("select count(*) from public.sessions where subject_id = %s and mode = 'homework' and status <> 'finished'", [subj])[0][0]
    rub = sql("""select count(*) from public.sessions s join public.grading_items gi on gi.id = s.grading_item_id
                 where s.subject_id = %s and s.status <> 'finished' and gi.category ilike 'Pr%%ctica%%'""", [subj])[0][0]
    check('A2', 'Asigna 3 actividades de una vez, como tarea y al rubro «Prácticas para casa»', n == 3 and rub == 3, f'{n} sesiones, {rub} con rubro')

    # ---------- B. Estudiante
    mc = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    mc.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    m = mc.new_page()
    m.on('pageerror', lambda e: errs.append(str(e)))
    m.goto(BASE)
    m.get_by_text('Mis actividades y notas').click()
    m.get_by_label('Código del aula').fill(code.lower())
    m.keyboard.press('Enter')
    m.get_by_label('Tu RU').fill(ru)
    m.keyboard.press('Enter')
    m.get_by_label('Últimos 3 dígitos de tu CI').fill(ci3)
    m.keyboard.press('Enter')
    m.get_by_role('heading', name=re.compile('^Por hacer')).wait_for(timeout=10000)
    m.screenshot(path=OUT + 'aula_B_lista.png', full_page=True)
    check('B1', 'Desde el inicio entra al aula con código + RU + CI (sin PIN) y ve las 3 por hacer',
          m.get_by_role('button', name='Hacer').count() == 3, f"{m.get_by_role('button', name='Hacer').count()} botones Hacer")
    m.get_by_role('button', name='Hacer').first.click()
    m.wait_for_url('**/play/*', timeout=10000)
    m.get_by_role('button', name='Comenzar').wait_for(timeout=15000)
    check('B2', 'Con un botón abre la actividad (sin escribir PIN ni RU otra vez)', True)
    m.get_by_role('button', name='Comenzar').click()
    m.wait_for_timeout(4000)
    for it in CL:
        loc = m.locator('button[aria-pressed]', has_text=it['term'])
        if not loc.count():
            continue
        loc.first.click()
        m.get_by_role('dialog').get_by_role('button', name=it['group'], exact=True).click()
        m.wait_for_timeout(1000)
    m.wait_for_timeout(2500)
    m.wait_for_timeout(1500)
    m.get_by_role('link', name='Volver a mis actividades').click()
    m.get_by_role('heading', name=re.compile('^Por hacer')).wait_for(timeout=10000)
    m.wait_for_timeout(800)
    hechas = m.get_by_text('Hechas · puedes mejorar tu nota').count()
    check('B3', 'Vuelve al aula: quedan 2 por hacer y la hecha muestra su nota', m.get_by_role('button', name='Hacer').count() == 2 and hechas == 1,
          f"Hacer={m.get_by_role('button', name='Hacer').count()} hechas={hechas}")
    m.screenshot(path=OUT + 'aula_B_hecha.png', full_page=True)
    m.get_by_role('tab', name='Mis notas').click()
    m.get_by_text(re.compile('^Llevas en el')).wait_for(timeout=10000)
    m.wait_for_timeout(1200)
    g = call('portal_grades', {'p_code': code, 'p_ru': ru, 'p_ci': ci3}, teacher=False)
    pr = next((i for i in g['plan']['items'] if i['category'].lower().startswith('práctica') and any(s['grading_item_id'] == i['id'] for s in g['sessions'])), None)
    mine = [x['grade'] for x in g['grades'] if any(s['id'] == x['session_id'] and s['grading_item_id'] == (pr or {}).get('id') for s in g['sessions'])]
    exp = round(sum(float(v) for v in mine) / len(mine) / 100 * float(pr['weight']), 2) if mine else None
    card = m.locator(f'[data-rubro="{pr["category"]}"]').filter(has_text='Promedio de').first
    txt = card.inner_text() if card.count() else ''
    shown = f'{exp:g}'.replace('.', ',') if exp is not None else '?'
    check('B6', '«Mis notas» muestra el total de su categoría (promedio convertido a puntos, igual que la libreta)',
          exp is not None and shown in txt and 'Promedio de 1 actividad' in txt, f'esperado {shown} / {pr["weight"]}: {txt[:90]!r}')
    m.screenshot(path=OUT + 'aula_B_notas.png', full_page=True)
    m.get_by_role('tab', name='Mis actividades').click()
    m.reload()
    m.get_by_role('heading', name=re.compile('^Por hacer')).wait_for(timeout=10000)
    check('B4', 'Al recargar no le vuelve a pedir el RU (queda en su celular)', m.get_by_label('Tu RU').count() == 0)
    m.get_by_role('button', name='No soy yo').click()
    check('B5', '«No soy yo» cierra su aula en ese celular', m.get_by_label('Tu RU').count() == 1)
    b.close()

check('Z1', 'Sin errores de JavaScript', not errs, '; '.join(errs[:3]))
ok = sum(r['ok'] for r in results)
print(f'\nResultado: {ok}/{len(results)}')
raise SystemExit(0 if ok == len(results) else 1)
