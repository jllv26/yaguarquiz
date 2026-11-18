\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select id as quiz from public.quizzes where title like 'Repaso Unidad 1%' limit 1 \gset
select id as subj from public.subjects where code = 'DEMO 023' \gset
-- Crear pregunta nueva con 3 opciones
select public.save_question(jsonb_build_object('quiz_id', :'quiz', 'type','single','prompt','¿2+2?','time_limit_sec',10,'base_points',2000,
  'tags', '["mate"]'::jsonb, 'options', '[{"text":"3"},{"text":"4","is_correct":true},{"text":"5"}]'::jsonb)) as r \gset
select :'r'::jsonb ->> 'id' as qid, jsonb_array_length(:'r'::jsonb -> 'options') as n_opts \gset
select :'n_opts' as opciones_creadas;
-- Editar: quitar una opción y renombrar otra
select public.save_question(jsonb_build_object('id', :'qid', 'quiz_id', :'quiz', 'type','single','prompt','¿Cuánto es 2+2?','time_limit_sec',20,'base_points',1000,
  'options', jsonb_build_array(jsonb_build_object('id', (:'r'::jsonb -> 'options' -> 1 ->> 'id'), 'text','Cuatro','is_correct',true), jsonb_build_object('text','Tres')))) is not null as editada;
select prompt, base_points, (select string_agg(text || case when is_correct then '*' else '' end, ',' order by sort_order) from public.question_options where question_id = :'qid') as opciones from public.questions where id = :'qid';
-- Importar 2 preguntas en lote
select public.import_questions(:'quiz', '[{"type":"true_false","prompt":"El sol es una estrella","options":[{"text":"Verdadero","is_correct":true},{"text":"Falso"}]},{"type":"short_text","prompt":"Capital de Pando","accepted_answers":["Cobija"]}]'::jsonb) as importadas;
select count(*) as preguntas_en_quiz from public.questions where quiz_id = :'quiz';
-- Duplicar evaluación
select public.duplicate_quiz(:'quiz') as copia \gset
select title, status, (select count(*) from public.questions where quiz_id = :'copia') as preguntas, (select count(*) from public.question_options o join public.questions q on q.id=o.question_id where q.quiz_id = :'copia') as opciones from public.quizzes where id = :'copia';
-- Reordenar (invertir) y mover 1 pregunta
select array_agg(id order by sort_order desc) as ids from public.questions where quiz_id = :'copia' \gset
select public.reorder_questions(:'copia', :'ids');
select public.move_questions(array[:'qid']::uuid[], :'copia') as movidas;
select count(*) as quiz_original from public.questions where quiz_id = :'quiz';
-- Docente 2 (aprobado) no puede leer ni copiar ni editar
reset role; set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.save_question(jsonb_build_object('id', :'qid', 'quiz_id', :'quiz', 'type','single','prompt','HACK'));
select public.duplicate_quiz(:'quiz');
select public.copy_questions(array[:'qid']::uuid[], :'quiz');
-- Storage: docente 2 no sube en carpeta ajena; sí en la suya
insert into storage.objects (bucket_id, name) values ('media', '11111111-1111-1111-1111-111111111111/x.webp');
insert into storage.objects (bucket_id, name) values ('media', '22222222-2222-2222-2222-222222222222/quizzes/q/x.webp');
reset role;
select prompt from public.questions where id = :'qid';
select name from storage.objects;
select id, public from storage.buckets;
