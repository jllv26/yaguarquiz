\set ON_ERROR_STOP 0
-- Simular registros: primer usuario = admin aprobado, segundo = pendiente
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','jimmy@test.bo','{"full_name":"Jimmy"}'),
 ('22222222-2222-2222-2222-222222222222','otro@test.bo','{}');
select email, role, approved from public.teachers order by email;

-- Docente 1 carga datos de ejemplo
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.seed_demo_data();
select public.seed_demo_data();  -- idempotente
select public.dashboard_counts();
select count(*) as items, sum(weight) as total_pts from public.grading_items;
-- No puede auto-cambiar su rol a teacher->admin (ya es admin) ni insertarse en teachers
insert into public.teachers (id) values (gen_random_uuid());
reset role;

-- Docente 2 (pendiente) no ve nada ni puede crear, ni auto-aprobarse
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'docente2_questions' as t, count(*) from public.questions;
insert into public.academic_years (year) values (2027);
update public.teachers set approved = true, role='admin' where id = auth.uid();
reset role;
select email, role, approved from public.teachers order by email;

-- Admin aprueba al docente 2; aun así no ve datos del docente 1 ni puede colgar datos en ellos
update public.teachers set approved = true where email='otro@test.bo';
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'docente2_ve_questions' as t, count(*) from public.questions;
reset role;
select id as y1 from public.academic_years where teacher_id='11111111-1111-1111-1111-111111111111' limit 1 \gset
select id as q1 from public.quizzes limit 1 \gset
set role authenticated;
insert into public.periods (academic_year_id, name) values (:'y1', 'hack');
insert into public.questions (quiz_id, type, prompt, teacher_id)
  values (:'q1', 'single', 'hack', auth.uid());
update public.questions set prompt='hack';
select count(*) as d2_updated_visible from public.questions where prompt='hack';
reset role;
select 'periodos hack' as t, count(*) from public.periods where name='hack';

-- Anónimo: sin acceso a tablas, sí a keep_alive y server_time
set role anon; select set_config('request.jwt.claim.sub','',false);
select count(*) from public.questions;
select count(*) from public.question_options;
select public.keep_alive();
select public.server_time() is not null as server_time_ok;
select public.seed_demo_data();
reset role;

-- Borrado de demo
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.delete_demo_data(); select public.dashboard_counts();
reset role;
