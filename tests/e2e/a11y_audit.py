"""Auditoría automática de accesibilidad (axe-core, reglas WCAG 2 A/AA) en las pantallas principales."""
import json, sys, time
import psycopg
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4174/yaguarquiz/'
AXE = open('/home/claude/qa-tools/node_modules/axe-core/axe.min.js').read()
UID = '11111111-1111-1111-1111-111111111111'
db = psycopg.connect('host=/tmp port=5544 user=postgres dbname=t', autocommit=True)

def q(sql, a=()):
    with db.cursor() as c:
        c.execute(sql, a)
        return c.fetchall() if c.description else None

def teacher_call(fn, args_sql, vals):
    with db.cursor() as c:
        c.execute('set role authenticated'); c.execute("select set_config('request.jwt.claim.sub', %s, false)", [UID])
        c.execute(f'select public.{fn}({args_sql})', vals); r = c.fetchone()[0]; c.execute('reset role'); return r

if not q("select 1 from public.subjects where code = 'DEMO 023'"):
    teacher_call('seed_demo_data', '', [])
q("update public.sessions set status='finished' where status <> 'finished'")
quiz, subj = q("select id::text, subject_id::text from public.quizzes where title like 'Repaso Unidad 1%%' limit 1")[0]
from psycopg.types.json import Jsonb
s = teacher_call('create_session', 'p_quiz => %s, p_subject => %s, p_settings => %s', [quiz, subj, Jsonb({'identification': 'roster', 'require_ci': True})])
sid, pin = s['id'], s['pin']

sess = {'access_token': 'x.e30.y', 'refresh_token': 'r', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer',
        'user': {'id': UID, 'email': 'docente@ejemplo.bo', 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-11-17T00:00:00Z'}}
PAGES = [
    ('Inicio (claro)', '#/', False, 'light'),
    ('Inicio (oscuro)', '#/', False, 'dark'),
    ('Unirse (RU)', f'#/play/{pin}', False, 'light'),
    ('PIN inexistente', '#/play/999999', False, 'light'),
    ('Login docente', '#/admin/login', False, 'light'),
    ('Panel docente', '#/admin', True, 'light'),
    ('Sesiones', '#/admin/sesiones', True, 'light'),
    ('Proyector: sala', f'#/host/{sid}', True, 'dark'),
    ('Vitrina de diseño', '#/diseno', False, 'light'),
    ('Manual del estudiante', '#/ayuda', False, 'light'),
    ('Actividades (docente)', '#/admin/actividades', True, 'light'),
]
expo = q("select id::text, pin from public.presentations where status <> 'closed' order by created_at desc limit 1")
if expo:
    PAGES.append(('Exposiciones (docente)', '#/admin/exposiciones', True, 'light'))
    PAGES.append(('Editor de exposición', f'#/admin/exposiciones/{expo[0][0]}', True, 'light'))
    PAGES.append(('Control de la exposición', f'#/expo-host/{expo[0][0]}', True, 'light'))
    PAGES.append(('Control de la exposición (oscuro)', f'#/expo-host/{expo[0][0]}', True, 'dark'))
    PAGES.append(('Exposición: ingreso del estudiante', f'#/expo/{expo[0][1]}', False, 'light'))
act = q("select id::text from public.quizzes where settings ? 'activity' order by updated_at desc limit 1")
if act:
    PAGES.append(('Editor de actividad', f'#/admin/actividades/{act[0][0]}', True, 'light'))
# cada juego de la vitrina (mismos componentes que ve el estudiante), en claro y en oscuro
for tab in ['Crucigrama', 'Sopa', 'Relacionar', 'Memoria', 'Completar', 'Rosco', 'Letras', 'Frases', 'Adivina', 'Clasificar']:
    PAGES.append((f'Juego: {tab}', '#/diseno', False, 'light' if tab not in ('Rosco', 'Memoria', 'Adivina') else 'dark', tab))
total = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, path, teacher, scheme, *tab in PAGES:
        ctx = b.new_context(viewport={'width': 1366, 'height': 768}, color_scheme=scheme)
        init = f"localStorage.setItem('yq-theme','{scheme}'); sessionStorage.setItem('yq-no-intro','1');"
        if teacher: init += f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)}));"
        ctx.add_init_script(init)
        pg = ctx.new_page(); pg.goto(BASE + path); pg.wait_for_timeout(2500)
        if tab:
            pg.get_by_role('tab', name=tab[0]).click(); pg.wait_for_timeout(1200)
        pg.add_script_tag(content=AXE)
        target = "document.querySelector('[data-testid=activity-demo]')" if tab else 'document'
        r = pg.evaluate("axe.run(" + target + ", {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r => r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, ex: v.nodes.slice(0,3).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary||'').split('\\n').slice(1,2).join(''))})))")
        total[name] = r
        print(f'\n== {name}: {len(r)} reglas con fallas')
        for v in r:
            print(f"  [{v['impact']}] {v['id']} ×{v['n']} — {v['help']}")
            for e in v['ex']: print('     ', e[:230])
        ctx.close()
    b.close()
json.dump(total, open('/tmp/a11y.json', 'w'), indent=1, ensure_ascii=False)
