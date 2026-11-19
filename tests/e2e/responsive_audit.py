"""
Auditoría de adaptabilidad: abre cada pantalla (docente, proyector y estudiante) y la recorre en 7 anchos
(celular 360/390, tablet 768/1024, laptop 1180/1366 y pantalla 1920). Marca:
  · botones, enlaces, campos o textos cortados por su contenedor (se salen de una tarjeta con overflow oculto)
  · cualquier cosa que se salga de la pantalla hacia los lados (aparece barra horizontal)
Los contenedores con desplazamiento propio (overflow auto/scroll, p. ej. tablas anchas) no cuentan como error.
Uso: python3 tests/e2e/responsive_audit.py   (requiere qa-up.sh: fake_supabase en :5555 y build QA en :4174)
"""
import json, os, sys, time
import psycopg
from psycopg.types.json import Jsonb
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4174/yaguarquiz/'
UID = '11111111-1111-1111-1111-111111111111'
OUT = os.environ.get('QA_OUT', '/tmp/qa-shots/responsive/')
os.makedirs(OUT, exist_ok=True)
WIDTHS = [(360, 740), (390, 844), (768, 1024), (1024, 768), (1180, 800), (1366, 768), (1920, 1080)]
db = psycopg.connect('host=/tmp port=5544 user=postgres dbname=t', autocommit=True)


def q(sql, a=()):
    with db.cursor() as c:
        c.execute('reset role'); c.execute(sql, a)
        return c.fetchall() if c.description else None


def call(fn, args, teacher=True):
    with db.cursor() as c:
        c.execute('set role authenticated' if teacher else 'set role anon')
        c.execute("select set_config('request.jwt.claim.sub', %s, false)", [UID if teacher else ''])
        c.execute(f'select public.{fn}(' + ', '.join(f'{n} => %s' for n in args) + ')',
                  [Jsonb(v) if isinstance(v, (dict, list)) else v for v in args.values()])
        r = c.fetchone()[0]; c.execute('reset role'); return r


if not q("select 1 from public.subjects where code = 'DEMO 023'"):
    call('seed_demo_data', {})
q("update public.sessions set status = 'finished' where status <> 'finished'")
subj = q("select id::text from public.subjects where code = 'DEMO 023'")[0][0]
studs = q("""select s.id::text, s.university_code, s.ci from public.students s join public.enrollments e on e.student_id = s.id
             where e.subject_id = %s order by 1""", [subj])
normal_quiz = q("select id::text from public.quizzes where title like 'Repaso Unidad 1%%' limit 1")[0][0]
big_exam = (q("select id::text from public.quizzes where settings->>'seed' = 'icom261-p3-2026' and not settings ? 'activity' limit 1") or [[normal_quiz]])[0][0]
acts = q("""select distinct on (settings->'activity'->>'type') id::text, settings->'activity'->>'type', settings->'launch'->>'pick_count'
            from public.quizzes where settings ? 'activity' order by settings->'activity'->>'type', (settings->>'order')::int""")

# Sesiones: en vivo (sala), examen con estudiantes (monitor), reporte terminado
live = call('create_session', {'p_quiz': normal_quiz, 'p_subject': subj, 'p_settings': {'identification': 'roster'}})
exam = call('create_session', {'p_quiz': big_exam, 'p_subject': subj, 'p_settings': {'mode': 'exam', 'pick_count': 35, 'time_limit_min': 50, 'focus_mode': False}})
for k, st in enumerate(studs[:3]):
    j = call('join_session', {'p_pin': exam['pin'], 'p_code': st[1], 'p_ci': st[2][-3:], 'p_nickname': None, 'p_avatar': {}, 'p_device': f'aud-{k}'}, teacher=False)
    call('start_attempt', {'p_token': j['token']}, teacher=False)
rep = call('create_session', {'p_quiz': normal_quiz, 'p_subject': subj, 'p_settings': {'mode': 'homework'}})
j = call('join_session', {'p_pin': rep['pin'], 'p_code': studs[5][1], 'p_ci': None, 'p_nickname': None, 'p_avatar': {}, 'p_device': 'aud-r'}, teacher=False)
call('start_attempt', {'p_token': j['token']}, teacher=False); call('submit_attempt', {'p_token': j['token']}, teacher=False)
q("update public.sessions set status = 'finished', finished_at = now() where id = %s", [rep['id']])

# Exposición con expositores y uno en escena
RUBRIC = {'levels': [{'v': 1, 'emoji': '🆘', 'label': 'Pide rescate', 'hint': 'No suficiente'}, {'v': 2, 'emoji': '🛟', 'label': 'Se salva', 'hint': 'Suficiente'}, {'v': 3, 'emoji': '🏆', 'label': '¡Salvó el semestre!', 'hint': 'Excelente'}],
          'criteria': [{'title': t, 'question': '¿Lo hizo bien?', 'icon': '⭐', 'levels': {}} for t in ['Dominio del tema', 'Momento memorable', 'Caso real de Cobija', 'Claridad y tiempo', 'Responde preguntas']]}
pres = [{'student_id': s[0], 'group_no': i // 2 + 1, 'topic': ['Redes sociales y community management', 'Protección de datos y ética digital', 'Marketing estratégico, operativo y SMART'][i // 2], 'day': 1, 'sort_order': i + 1} for i, s in enumerate(studs[:6])]
pid = call('save_presentation', {'p': {'subject_id': subj, 'title': 'Exposiciones del Tercer Parcial', 'rubric': RUBRIC, 'settings': {'teacher_weight': 50, 'require_ci': True}, 'presenters': pres}})
call('presentation_control', {'p_id': pid, 'p_action': 'next', 'p_target': None, 'p_arg': None})
expo_pin = call('presentation_host', {'p_id': pid})['presentation']['pin']

sess = {'access_token': 'x.e30.y', 'refresh_token': 'r', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer',
        'user': {'id': UID, 'email': 'docente@ejemplo.bo', 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-11-17T00:00:00Z'}}
act_ids = {t: i for i, t, _ in acts}
TEACHER = [
    ('Panel', '#/admin'), ('Asignaturas', '#/admin/asignaturas'), ('Asignatura', f'#/admin/asignaturas/{subj}'),
    ('Estudiantes', '#/admin/estudiantes'), ('Evaluaciones', '#/admin/evaluaciones'), ('Editor de evaluación (131 preguntas)', f'#/admin/evaluaciones/{big_exam}'),
    ('Actividades', '#/admin/actividades'),
    *[(f'Editor de actividad: {t}', f'#/admin/actividades/{i}') for t, i in act_ids.items()],
    ('Exposiciones', '#/admin/exposiciones'), ('Editor de exposición', f'#/admin/exposiciones/{pid}'), ('Nueva exposición', '#/admin/exposiciones/nueva'),
    ('Sesiones', '#/admin/sesiones'), ('Reportes', '#/admin/reportes'), ('Reporte de sesión', f'#/admin/reportes/{rep["id"]}'),
    ('Configuración', '#/admin/configuracion'), ('Proyector: sala en vivo', f'#/host/{live["id"]}'), ('Monitor del examen', f'#/host/{exam["id"]}'),
    ('Control de exposición', f'#/expo-host/{pid}'), ('Reporte para imprimir', f'#/reporte/{rep["id"]}/imprimir'),
]
PUBLIC = [('Inicio', '#/'), ('Login docente', '#/admin/login'), ('Ayuda', '#/ayuda'), ('Diseño', '#/diseno'), ('Unirse (RU)', f'#/play/{live["pin"]}'), ('PIN inexistente', '#/play/999999')]

DETECT = r"""
() => {
  const vw = document.documentElement.clientWidth
  const out = []
  const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50)
  const scrollable = (cs) => /auto|scroll/.test(cs.overflowX)
  const sel = 'button, a[href], input, select, textarea, label, h1, h2, h3, p, li, td, th, [role=button], [role=tab]'
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const cs0 = getComputedStyle(el)
    if (cs0.visibility === 'hidden' || el.closest('[aria-hidden=true], [data-allow-clip], .sr-only')) continue
    let a = el.parentElement, inScroll = false
    while (a && a !== document.body) {
      const cs = getComputedStyle(a)
      if (scrollable(cs)) { inScroll = true; break }
      if (cs.overflowX !== 'visible' && cs.overflowX !== '') {
        if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') break
        const ar = a.getBoundingClientRect()
        if (r.right > ar.right + 3 || r.left < ar.left - 3) out.push({ kind: 'cortado', el: el.tagName.toLowerCase(), text: name(el), by: Math.round(Math.max(r.right - ar.right, ar.left - r.left)) })
        break
      }
      a = a.parentElement
    }
    // fuera de la pantalla (solo si no está dentro de un contenedor con desplazamiento propio)
    if (!inScroll && cs0.position !== 'fixed' && (r.right > vw + 3 || r.left < -3)) out.push({ kind: 'fuera de pantalla', el: el.tagName.toLowerCase(), text: name(el), by: Math.round(Math.max(r.right - vw, -r.left)) })
  }
  const docOver = document.documentElement.scrollWidth - vw
  const seen = new Set()
  return { docOver, issues: out.filter((x) => { const k = x.kind + x.text; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 12) }
}
"""

report = []


def audit(pg, label, settle=900):
    for w, h in WIDTHS:
        pg.set_viewport_size({'width': w, 'height': h})
        pg.wait_for_timeout(settle)
        r = pg.evaluate(DETECT)
        bad = r['issues'] or r['docOver'] > 3
        report.append({'page': label, 'w': w, 'docOver': r['docOver'], 'issues': r['issues']})
        if bad:
            pg.screenshot(path=f"{OUT}{label.replace(' ', '_').replace('/', '-').replace(':', '')}_{w}.png")
            print(f'  ✖ {label} @ {w}px — barra horizontal: {r["docOver"]}px · ' + '; '.join(f'{i["kind"]} {i["el"]} «{i["text"]}» ({i["by"]}px)' for i in r['issues'][:5]), flush=True)
    print(f'  · {label}', flush=True)


def join_student(pg, pin, code, ci):
    pg.goto(BASE + f'#/play/{pin}'); pg.wait_for_timeout(1500)
    pg.get_by_label('Tu RU').fill(code); pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
    if pg.get_by_label('Últimos 3 dígitos').count():
        pg.get_by_label('Últimos 3 dígitos').fill(ci[-3:]); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    if pg.get_by_role('button', name='Sí, soy yo').count():
        pg.get_by_role('button', name='Sí, soy yo').click()
    pg.get_by_role('button', name='Entrar').click()
    pg.wait_for_timeout(1200)
    if pg.get_by_label('Tu correo').count():
        audit(pg, 'Unirse: pedir correo', 400)
        pg.get_by_role('button', name='Ahora no').click()


with sync_playwright() as p:
    b = p.chromium.launch()
    print('== Pantallas públicas')
    for theme in ['light']:
        ctx = b.new_context(viewport={'width': 390, 'height': 844})
        ctx.add_init_script(f"localStorage.setItem('yq-theme','{theme}'); sessionStorage.setItem('yq-no-intro','1')")
        for label, path in PUBLIC:
            pg = ctx.new_page(); pg.goto(BASE + path); pg.wait_for_timeout(2000); audit(pg, label); pg.close()
        ctx.close()

    print('== Docente')
    ctx = b.new_context(viewport={'width': 1366, 'height': 768})
    ctx.add_init_script(f"localStorage.setItem('yq-auth', JSON.stringify({json.dumps(sess)})); localStorage.setItem('yq-theme','dark'); sessionStorage.setItem('yq-no-intro','1')")
    for label, path in TEACHER:
        pg = ctx.new_page(); pg.goto(BASE + path); pg.wait_for_timeout(2500); audit(pg, label); pg.close()
    # Lanzar (modal) desde Actividades
    pg = ctx.new_page(); pg.goto(BASE + '#/admin/actividades'); pg.wait_for_timeout(2500)
    pg.get_by_role('button', name='Lanzar').first.click(); pg.wait_for_timeout(1200); audit(pg, 'Modal Lanzar (actividad)'); pg.close()
    pg = ctx.new_page(); pg.goto(BASE + '#/admin/evaluaciones'); pg.wait_for_timeout(2500)
    pg.get_by_role('button', name='Lanzar').first.click(); pg.wait_for_timeout(1200); audit(pg, 'Modal Lanzar (evaluación)'); pg.close()
    ctx.close()

    print('== Estudiante')
    k = 6
    # examen
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    pg = ctx.new_page(); join_student(pg, exam['pin'], studs[k][1], studs[k][2]); k += 1
    pg.get_by_role('button', name='Comenzar').click(); pg.wait_for_timeout(2500); audit(pg, 'Examen (pregunta)')
    ctx.close()
    # una pantalla por cada tipo de actividad
    for aid, t, pick in acts:
        s = call('create_session', {'p_quiz': aid, 'p_subject': subj, 'p_settings': {'mode': 'homework', 'show_correct': 'each', 'max_attempts': 3, 'pick_count': int(pick) if pick else None}})
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
        pg = ctx.new_page(); st = studs[k % len(studs)]; k += 1
        join_student(pg, s['pin'], st[1], st[2])
        pg.get_by_role('button', name='Comenzar').click(); pg.wait_for_timeout(2500)
        if t == 'classify':
            pg.locator('div.border-dashed button[aria-pressed]').first.click(); pg.wait_for_timeout(500)
        audit(pg, f'Actividad: {t}')
        ctx.close()
    # exposición (estudiante evaluando)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script("localStorage.setItem('yq-theme','light'); sessionStorage.setItem('yq-no-intro','1')")
    pg = ctx.new_page(); st = studs[8]
    pg.goto(BASE + f'#/expo/{expo_pin}'); pg.wait_for_timeout(1800)
    try:
        pg.get_by_label('Tu RU').fill(st[1]); pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        if pg.get_by_label('Últimos 3 dígitos').count():
            pg.get_by_label('Últimos 3 dígitos').fill(st[2][-3:]); pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        if pg.get_by_role('button', name='Sí, soy yo').count(): pg.get_by_role('button', name='Sí, soy yo').click(); pg.wait_for_timeout(900)
        if pg.get_by_role('button', name='Entrar').count(): pg.get_by_role('button', name='Entrar').click()
        pg.wait_for_timeout(2000)
    except Exception as e:
        print('  (exposición: ingreso)', str(e)[:120])
    audit(pg, 'Exposición: estudiante')
    ctx.close()
    b.close()

bad = [r for r in report if r['issues'] or r['docOver'] > 3]
pages = len({r['page'] for r in report})
json.dump(report, open(OUT + 'report.json', 'w'), ensure_ascii=False, indent=1)
print(f'\n{pages} pantallas × {len(WIDTHS)} anchos = {len(report)} revisiones · con problemas: {len(bad)}')
sys.exit(1 if bad else 0)
