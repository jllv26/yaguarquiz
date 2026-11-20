"""
Servidor de pruebas que imita la API de Supabase (REST/RPC/Auth) sobre un PostgreSQL local
con todas las migraciones de /supabase/migrations aplicadas.

Permite probar la app publicada (compilada con VITE_SUPABASE_URL=http://localhost:5555)
en CUALQUIER navegador (Chromium, WebKit, …) contra el motor de juego real.

- Llamadas RPC → `select public.<fn>(...)` con el rol correcto:
  token del docente "x.e30.y" → rol authenticated (auth.uid() = UID); cualquier otro → rol anon.
- Registra cada respuesta enviada a un estudiante (rol anon) junto con la fase de la sesión,
  para comprobar que ninguna trae la respuesta correcta antes de la revelación.
- Realtime (websocket) no se imita: la app cae a consultas periódicas, como debe hacerlo.

Uso:  python3 tests/e2e/fake_supabase.py  (puerto 5555; base: host=/tmp port=5544 dbname=t)
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import psycopg
from psycopg.types.json import Jsonb

DSN = 'host=/tmp port=5544 user=postgres dbname=t'
UID = '11111111-1111-1111-1111-111111111111'
TEACHER = {'id': UID, 'full_name': 'Docente de prueba', 'email': 'docente@ejemplo.bo',
           'photo_url': None, 'role': 'admin', 'approved': True}
LOG_PATH = '/tmp/fake_supabase_log.jsonl'
_local = threading.local()
_log_lock = threading.Lock()


def conn():
    c = getattr(_local, 'c', None)
    if c is None or c.closed:
        c = _local.c = psycopg.connect(DSN, autocommit=True)
    return c


def call(fn, args, teacher):
    with conn().cursor() as c:
        c.execute('reset role')
        if teacher:
            c.execute('set role authenticated')
            c.execute("select set_config('request.jwt.claim.sub', %s, false)", [UID])
        else:
            c.execute('set role anon')
            c.execute("select set_config('request.jwt.claim.sub', '', false)")
        names = list(args.keys())
        q = f'select public.{fn}(' + ', '.join(f'{n} => %s' for n in names) + ')'
        # como PostgREST: una lista de valores simples va a un parámetro arreglo (int[], uuid[]); objetos y listas de objetos, a jsonb
        vals = [v if isinstance(v, list) and all(not isinstance(x, (dict, list)) for x in v) and v
                else Jsonb(v) if isinstance(v, (dict, list)) else v for v in args.values()]
        try:
            c.execute(q, vals)
            return c.fetchone()[0]
        finally:
            c.execute('reset role')


def admin(q, a=()):
    with conn().cursor() as c:
        c.execute('reset role')
        c.execute(q, a)
        return c.fetchall() if c.description else None


def log(entry):
    with _log_lock, open(LOG_PATH, 'a') as f:
        f.write(json.dumps(entry, default=str) + '\n')


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silencio
        pass

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin') or '*')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Expose-Headers', 'Content-Range')

    def reply(self, status, body):
        data = json.dumps(body, default=str).encode()
        self.send_response(status)
        self.cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n) if n else b''
        return json.loads(raw or b'{}')

    @property
    def teacher(self):
        return 'x.e30.y' in (self.headers.get('Authorization') or '')

    def single(self):
        return 'vnd.pgrst.object' in (self.headers.get('Accept') or '')

    def do_GET(self):
        u = urlparse(self.path)
        if u.path.startswith('/auth/v1/user'):
            return self.reply(200, {'id': UID, 'email': TEACHER['email'], 'aud': 'authenticated', 'role': 'authenticated'})
        if u.path.startswith('/realtime/'):
            return self.reply(404, {})
        if u.path == '/rest/v1/teachers':
            return self.reply(200, TEACHER if self.single() else [TEACHER])
        if u.path == '/rest/v1/sessions' and 'quizzes(visual_theme)' in (u.query or ''):
            sid = parse_qs(u.query).get('id', [''])[0].removeprefix('eq.')
            r = admin('select q.visual_theme from public.sessions s join public.quizzes q on q.id = s.quiz_id where s.id::text = %s', [sid])
            row = {'quizzes': {'visual_theme': r[0][0]}} if r else None
            return self.reply(200, row if self.single() else ([row] if row else []))
        # Panel docente (lo mínimo para Actividades: lista, editor y selector de asignaturas)
        qs = parse_qs(u.query or '')
        eq = lambda k: (qs.get(k, [''])[0] or '').removeprefix('eq.') or None
        if u.path == '/rest/v1/quizzes' and self.teacher:
            qid = eq('id')
            r = admin('''select coalesce(json_agg(x order by x.updated_at desc), '[]') from (
                select q.*,
                  (select json_build_object('id', s.id, 'code', s.code, 'parallel', s.parallel, 'name', s.name, 'theme_color', s.theme_color,
                          'topics', (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'unit', t.unit, 'sort_order', t.sort_order)), '[]') from public.topics t where t.subject_id = s.id))
                     from public.subjects s where s.id = q.subject_id) as subjects,
                  (select json_build_object('name', t.name, 'unit', t.unit) from public.topics t where t.id = q.topic_id) as topics,
                  json_build_array(json_build_object('count', (select count(*) from public.questions where quiz_id = q.id))) as questions
                from public.quizzes q where q.teacher_id = %s and (%s::uuid is null or q.id = %s::uuid)) x''', [UID, qid, qid])[0][0]
            return self.reply(200, (r[0] if r else None) if self.single() else r)
        if u.path == '/rest/v1/questions' and self.teacher and eq('type') == 'game_item':
            r = admin('''select coalesce(json_agg(json_build_object('id', id, 'term', term, 'prompt', prompt, 'image_url', image_url, 'tags', tags) order by sort_order), '[]')
                         from public.questions where quiz_id = %s and type = 'game_item' ''', [eq('quiz_id')])[0][0]
            return self.reply(200, r)
        if u.path == '/rest/v1/grading_plans' and self.teacher:
            r = admin('''select json_build_object('id', gp.id, 'subject_id', gp.subject_id, 'pass_mark', gp.pass_mark, 'max_score', gp.max_score,
                           'grading_items', (select coalesce(json_agg(row_to_json(gi)), '[]') from public.grading_items gi where gi.plan_id = gp.id))
                         from public.grading_plans gp where gp.subject_id::text = %s''', [eq('subject_id')])
            row = r[0][0] if r else None
            return self.reply(200, row if self.single() else ([row] if row else []))
        if u.path == '/rest/v1/sessions' and self.teacher and eq('subject_id'):
            r = admin('''select coalesce(json_agg(json_build_object('quiz_id', quiz_id, 'scheduled_end', scheduled_end, 'status', status)), '[]')
                         from public.sessions where subject_id::text = %s and status <> 'finished' ''', [eq('subject_id')])[0][0]
            return self.reply(200, r)
        if u.path == '/rest/v1/sessions' and self.teacher and 'grading_items' in (u.query or ''):
            r = admin('''select coalesce(json_agg(json_build_object('quiz_id', s.quiz_id, 'scheduled_end', s.scheduled_end, 'status', s.status,
                           'grading_items', (select json_build_object('category', gi.category, 'term', gi.term) from public.grading_items gi where gi.id = s.grading_item_id))), '[]')
                         from public.sessions s where s.teacher_id = %s and s.status <> 'finished' and s.mode <> 'live' ''', [UID])[0][0]
            return self.reply(200, r)
        if u.path == '/rest/v1/subjects' and self.teacher:
            r = admin('''select coalesce(json_agg(json_build_object('id', s.id, 'code', s.code, 'name', s.name, 'parallel', s.parallel, 'theme_color', s.theme_color,
                           'portal_code', s.portal_code, 'period_id', s.period_id, 'career', s.career, 'semester', s.semester, 'cover_url', s.cover_url,
                           'periods', json_build_object('id', p.id, 'name', p.name, 'academic_year_id', p.academic_year_id, 'academic_years', json_build_object('year', y.year)),
                           'topics', (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'unit', t.unit, 'sort_order', t.sort_order)), '[]') from public.topics t where t.subject_id = s.id))
                           order by s.code), '[]')
                         from public.subjects s left join public.periods p on p.id = s.period_id left join public.academic_years y on y.id = p.academic_year_id
                        where s.teacher_id = %s and (%s::text is null or s.id::text = %s)''', [UID, eq('id'), eq('id')])[0][0]
            return self.reply(200, (r[0] if r else None) if self.single() else r)
        if u.path == '/rest/v1/teacher_settings' and self.teacher:
            r = admin('select row_to_json(t) from public.teacher_settings t where teacher_id = %s', [UID])
            row = r[0][0] if r else None
            return self.reply(200, row if self.single() else ([row] if row else []))
        return self.reply(200, None if self.single() else [])

    def do_POST(self):
        u = urlparse(self.path)
        if u.path.startswith('/auth/v1/'):
            return self.reply(200, {'access_token': 'x.e30.y', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600,
                                    'user': {'id': UID, 'email': TEACHER['email'], 'aud': 'authenticated', 'role': 'authenticated'}})
        if u.path.startswith('/rest/v1/rpc/'):
            fn = u.path.split('/rpc/')[1]
            args = self.body()
            try:
                res = call(fn, args, self.teacher)
            except Exception as e:  # mismo formato de error que PostgREST
                msg = str(e).split('\n')[0]
                return self.reply(400, {'message': msg, 'code': 'P0001'})
            if not self.teacher:
                phase = None
                sid = (res or {}).get('session', {}).get('id') if isinstance(res, dict) else None
                if sid:
                    r = admin('select phase from public.sessions where id = %s', [sid])
                    phase = r[0][0] if r else None
                log({'fn': fn, 'phase': phase, 'res': res})
            return self.reply(200, res)
        if u.path == '/rest/v1/quizzes' and self.teacher:
            b = self.body()
            b = b[0] if isinstance(b, list) else b
            qid = (parse_qs(u.query or '').get('id', [''])[0] or '').removeprefix('eq.')
            cols = [k for k in b if k in ('subject_id', 'topic_id', 'title', 'description', 'status', 'visual_theme')]
            if self.command == 'PATCH' and qid:
                admin('update public.quizzes set ' + ', '.join(f'{k} = %s' for k in cols) + ' where id = %s and teacher_id = %s', [b[k] for k in cols] + [qid, UID])
                rid = qid
            else:
                rid = admin('insert into public.quizzes (teacher_id, ' + ', '.join(cols) + ') values (%s' + ', %s' * len(cols) + ') returning id', [UID] + [b[k] for k in cols])[0][0]
            row = admin('select row_to_json(q) from public.quizzes q where id = %s', [rid])[0][0]
            return self.reply(201 if self.command == 'POST' else 200, row if self.single() else [row])
        if u.path == '/rest/v1/teacher_settings' and self.teacher:
            b = self.body()
            b = b[0] if isinstance(b, list) else b
            admin('''insert into public.teacher_settings (teacher_id, sheets_webapp_url, sheets_token) values (%s, %s, %s)
                     on conflict (teacher_id) do update set sheets_webapp_url = excluded.sheets_webapp_url, sheets_token = excluded.sheets_token''',
                  [UID, b.get('sheets_webapp_url'), b.get('sheets_token')])
            return self.reply(201, b)
        return self.reply(201, [])

    do_PATCH = do_POST


if __name__ == '__main__':
    open(LOG_PATH, 'w').close()
    print('fake supabase on :5555')
    ThreadingHTTPServer(('127.0.0.1', 5555), H).serve_forever()
