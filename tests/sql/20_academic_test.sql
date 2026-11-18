\set ON_ERROR_STOP 0
-- Requiere: 00_supabase_stub.sql + migraciones 0001-0003 aplicadas, y 10_rls_test.sql ejecutado (usuarios de prueba)
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.seed_demo_data();
select id as subj from public.subjects where code = 'DEMO 023' \gset
-- 3 filas: 1 nueva, 1 existente (DEMO-001 ya inscrito), 1 inválida (sin nombres)
select public.import_students(:'subj', '[
  {"university_code":" 2021-0453 ","ci":"1234567","last_names":"Nuevo Pérez","first_names":"Juan","email":"JUAN@Mail.com","career":"Turismo"},
  {"university_code":"demo-001","last_names":"Cambio","first_names":"Nombre"},
  {"university_code":"X-9","last_names":"","first_names":""}
]'::jsonb, false);
select university_code, last_names, email from public.students where university_code in ('2021-0453','DEMO-001') order by 1;
-- Con actualización de datos existentes
select public.import_students(:'subj', '[{"university_code":"DEMO-001","last_names":"Cambio","first_names":"Nombre"}]'::jsonb, true);
select university_code, last_names from public.students where university_code = 'DEMO-001';
select count(*) as inscritos from public.enrollments where subject_id = :'subj';

-- Plan: suma incorrecta → error; correcta → ok y sin duplicados
select public.save_grading_plan(:'subj', 51, '[{"term":1,"category":"Examen","weight":50}]'::jsonb);
select public.save_grading_plan(:'subj', 51, '[{"term":1,"category":"Examen","weight":30},{"term":2,"category":"Examen","weight":30},{"term":3,"category":"Examen","weight":30},{"term":3,"category":"Proyecto final","weight":10,"source":"manual"}]'::jsonb) is not null as plan_ok;
select term, category, weight, source from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id where gp.subject_id = :'subj' order by term, sort_order;

-- El admin aprueba al docente 2; aun aprobado, no puede tocar la asignatura del docente 1
reset role; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
update public.teachers set approved = true where email = 'otro@test.bo';
select email, approved from public.teachers order by email;
 set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.import_students(:'subj', '[{"university_code":"HACK","last_names":"A","first_names":"B"}]'::jsonb, false);
select public.save_grading_plan(:'subj', 51, '[{"term":1,"category":"X","weight":100}]'::jsonb);
reset role;
select count(*) as hack_students from public.students where university_code = 'HACK';
