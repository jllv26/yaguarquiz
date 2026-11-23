# Prueba de servidor de los 10 tipos nuevos (Froggy, AsterQuiz, Puzzle, Video, Diálogo, Sí o No, Filas, Adivinanza, Mapa, Presentación)
# uso: con la base local de pruebas y los datos de tests/sql/20 y 30 cargados → python3 tests/e2e/new_types_db.py
import psycopg, json
from psycopg.types.json import Jsonb
db=psycopg.connect('host=/tmp port=5544 user=postgres dbname=t',autocommit=True)
UID='11111111-1111-1111-1111-111111111111'
subj=db.execute("select id::text from subjects where code='DEMO 023' limit 1").fetchone()[0]
st=db.execute("select s.university_code, s.ci from students s join enrollments e on e.student_id=s.id where e.subject_id=%s and s.ci is not null order by 1",[subj]).fetchall()
def call(fn, args, teacher=True):
    with db.cursor() as c:
        c.execute('reset role'); c.execute('set role authenticated' if teacher else 'set role anon')
        c.execute("select set_config('request.jwt.claim.sub', %s, false)", [UID if teacher else ''])
        c.execute("select set_config('request.jwt.claims', %s, false)", [json.dumps({'sub':UID,'role':'authenticated'}) if teacher else '{}'])
        c.execute(f'select public.{fn}(' + ', '.join(f'{n} => %s' for n in args) + ')', [Jsonb(v) if isinstance(v,(dict,list)) else v for v in args.values()])
        r=c.fetchone()[0]; c.execute('reset role'); return r
res=[]
def check(n, ok, d=''):
    res.append(bool(ok)); print('✅' if ok else '❌', n, d if not ok else '')
k=[0]
def setup(settings, items, title):
    qid=db.execute("insert into quizzes (teacher_id, subject_id, title, status, settings) values (%s,%s,%s,'published','{}') returning id::text",[UID,subj,title]).fetchone()[0]
    call('save_activity',{'p_quiz':qid,'p_activity':settings,'p_items':items})
    ses=call('create_session',{'p_quiz':qid,'p_subject':subj,'p_settings':{'mode':'homework','max_attempts':2,'time_limit_min':15}})
    ru,ci=st[k[0]%len(st)]; k[0]+=1
    j=call('join_session',{'p_pin':ses['pin'],'p_code':ru,'p_ci':''.join(c for c in ci if c.isdigit())[-3:],'p_nickname':None,'p_avatar':{},'p_device':f't25-{k[0]}'},teacher=False)
    tok=j['token']; call('start_attempt',{'p_token':tok},teacher=False)
    s=call('activity_state',{'p_token':tok},teacher=False)
    return tok, s['current']['activity'], {r[0]:r for r in db.execute("select id::text, term, prompt, tags, extra from questions where quiz_id=%s",[qid]).fetchall()}
def play(tok,a,d): return call('activity_play',{'p_token':tok,'p_action':a,'p_data':d},teacher=False)
def finish(tok):
    call('finish_attempt',{'p_token':tok,'p_reason':'done'},teacher=False) if False else None
    return db.execute("select grade from attempts a join participants p on p.id=a.participant_id where p.token=%s order by number desc limit 1",[tok]).fetchone()[0]
MCI=[{'term':'CTR','prompt':'¿Qué mide los clics sobre impresiones?','extra':{'wrong':['CPA','ROAS']}},{'term':'Alcance','prompt':'Personas distintas que vieron','extra':{'wrong':['Impresiones','Lead'],'t':30}},{'term':'Lead','prompt':'Deja sus datos','extra':{'wrong':['Influencer'],'t':10}}]
for typ in ['froggy','asterquiz','puzzle','video','dialogue']:
    tok,act,qs=setup({'type':typ,'image_url':'data:x','video_url':'https://youtu.be/abc','dialogue':[{'who':'Ana','text':'Hola'}]},MCI,f'T {typ}')
    b=act['board']; it=b['items']
    check(f'{typ}: tablero con opciones', all(len(x['options'])>=2 for x in it) and all('term' not in x for x in it), json.dumps(it)[:200])
    if typ=='video': check('video: ordenado por segundo', [x['t'] for x in it]==sorted(x['t'] for x in it), str([x['t'] for x in it]))
    if typ=='dialogue': check('dialogue: trae el diálogo', b.get('dialogue')==[{'who':'Ana','text':'Hola'}])
    x=it[0]; term=qs[x['key']][1]; wrong=[o for o in x['options'] if o!=term][0]
    r=play(tok,'answer',{'item':x['key'],'value':wrong}); check(f'{typ}: incorrecta → 0 y sin más intentos', r['correct'] is False and r['done'] is True, r)
    y=it[1]; r=play(tok,'answer',{'item':y['key'],'value':qs[y['key']][1]}); check(f'{typ}: correcta → 1000', r['correct'] and r['points']==1000, r)
# yesno
tok,act,qs=setup({'type':'yesno','question':'¿Es un objetivo SMART?'},[{'term':'Vender más','group':'No'},{'term':'Ganar 50 seguidores en marzo','group':'Sí'}],'T yesno')
b=act['board']; check('yesno: pregunta', b['question']=='¿Es un objetivo SMART?')
for x in b['items']:
    g=qs[x['key']][3][0]; r=play(tok,'answer',{'item':x['key'],'value':g}); check(f'yesno: {x["text"]} → {g}', r['correct'], r)
try:
    setup({'type':'yesno'},[{'term':'x','group':'Tal vez'}],'T yn bad'); check('yesno: rechaza grupo inválido', False)
except Exception as e: check('yesno: rechaza grupo inválido', 'Sí o No' in str(e), str(e))
# rows
tok,act,qs=setup({'type':'rows'},[{'term':'Atención | Interés | Deseo | Acción','prompt':'Método AIDA'},{'term':'Descubrimiento | Consideración | Compra','prompt':'Embudo'}],'T rows')
it=act['board']['items']; check('rows: fichas desordenadas', all(x['tiles']!=qs[x['key']][1].split(' | ') for x in it), str(it))
r=play(tok,'answer',{'item':it[0]['key'],'value':' | '.join(reversed(qs[it[0]['key']][1].split(' | ')))}); check('rows: orden malo → falla con intento', not r['correct'] and r['tries_left']==1, r)
r=play(tok,'answer',{'item':it[0]['key'],'value':qs[it[0]['key']][1].replace(' | ','|').lower()}); check('rows: orden bueno → 600 (2.º intento)', r['correct'] and r['points']==600, r)
# riddle
tok,act,qs=setup({'type':'riddle'},[{'term':'Remarketing','extra':{'clues':['Es en inglés','Vuelve a buscarte','Anuncios a quien ya visitó tu web']}},{'term':'SEO','extra':{'clues':['Tres letras','Google sin pagar']}}],'T riddle')
it=act['board']['items']; a0=[x for x in it if qs[x['key']][1]=='Remarketing'][0]
check('riddle: solo 1 pista al inicio', a0['clues']==['Es en inglés'] and a0['total']==3 and a0['words']==[11], a0)
r=play(tok,'clue',{'item':a0['key']}); check('riddle: pide pista 2', r['clue']=='Vuelve a buscarte' and r['clues']==2, r)
s=call('activity_state',{'p_token':tok},teacher=False); a0b=[x for x in s['current']['activity']['board']['items'] if x['key']==a0['key']][0]
check('riddle: tablero recuerda 2 pistas', len(a0b['clues'])==2, a0b)
r=play(tok,'answer',{'item':a0['key'],'value':'retargeting'}); check('riddle: mala → quedan 2', not r['correct'] and r['tries_left']==2, r)
r=play(tok,'answer',{'item':a0['key'],'value':'remarketing'}); check('riddle: buena con 2 pistas y 2.º intento → 600', r['correct'] and r['points']==600, r)
a1=[x for x in it if x['key']!=a0['key']][0]; r=play(tok,'answer',{'item':a1['key'],'value':'seo'}); check('riddle: sin pistas extra → 1000', r['points']==1000, r)
# map tap
tok,act,qs=setup({'type':'map','image_url':'data:x','map_mode':'tap'},[{'term':'Llamada a la acción','extra':{'x':50,'y':80}},{'term':'Copy','extra':{'x':20,'y':30}}],'T map')
b=act['board']; check('map: puntos con clave opaca y nombres', len(b['points'])==2 and all(len(p['key'])==16 for p in b['points']) and len(b['names'])==2, b)
n0=b['names'][0]; tx=qs[n0['key']][4]
right=[p for p in b['points'] if p['x']==tx['x'] and p['y']==tx['y']][0]; wrongp=[p for p in b['points'] if p is not right][0]
r=play(tok,'answer',{'item':n0['key'],'value':wrongp['key']}); check('map: punto equivocado falla', not r['correct'], r)
r=play(tok,'answer',{'item':n0['key'],'value':right['key']}); check('map: punto correcto → 600', r['correct'] and r['points']==600, r)
s=call('activity_state',{'p_token':tok},teacher=False); pr=s['current']['activity']['progress'][n0['key']]
check('map: progreso marca el punto acertado', pr.get('answer')==right['key'], pr)
# map write
tok,act,qs=setup({'type':'map','image_url':'data:x','map_mode':'write'},[{'term':'Copy','extra':{'x':20,'y':30}}],'T map w')
b=act['board']; r=play(tok,'answer',{'item':b['points'][0]['key'],'value':'copy'}); check('map escribir: correcto', r['correct'] and b['names'] is None, r)
# slides
tok,act,qs=setup({'type':'slides'},[{'term':'Intro','prompt':'Texto 1'},{'term':'Cierre','prompt':'Texto 2'}],'T slides')
it=act['board']['items']; check('slides: en orden', [x['title'] for x in it]==['Intro','Cierre'])
for x in it: r=play(tok,'seen',{'item':x['key']})
check('slides: vista suma', r['correct'] and r['points']==1000, r)
r=play(tok,'answer',{'item':it[0]['key'],'value':'x'}); check('slides: no acepta «answer»', not r['ok'], r)
print(f'RESUMEN {sum(res)}/{len(res)}')
