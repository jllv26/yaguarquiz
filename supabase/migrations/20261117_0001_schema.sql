-- =====================================================================
-- YaguarQuiz UAP — Fase 1: esquema base, seguridad (RLS) y utilidades
-- Ejecutar completo en Supabase > SQL Editor (se puede volver a ejecutar:
-- todas las instrucciones son idempotentes).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Docentes (1 fila por usuario de Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.teachers (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  photo_url   text,
  role        text not null default 'teacher' check (role in ('admin', 'teacher')),
  approved    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ¿El usuario actual es un docente aprobado?
create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teachers t where t.id = auth.uid() and t.approved);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teachers t where t.id = auth.uid() and t.approved and t.role = 'admin');
$$;

-- Al registrarse un usuario: se crea su ficha de docente.
-- El PRIMER usuario del sistema queda como administrador aprobado;
-- los siguientes quedan pendientes hasta que el administrador los apruebe.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.teachers) into is_first;
  insert into public.teachers (id, full_name, email, role, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    case when is_first then 'admin' else 'teacher' end,
    is_first
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un docente no puede auto-aprobarse ni cambiar su rol.
create or replace function public.protect_teacher_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.approved := old.approved;
  end if;
  new.id := old.id;
  return new;
end $$;

drop trigger if exists teachers_protect on public.teachers;
create trigger teachers_protect before update on public.teachers
  for each row execute function public.protect_teacher_fields();

drop trigger if exists teachers_updated on public.teachers;
create trigger teachers_updated before update on public.teachers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Estructura académica
-- ---------------------------------------------------------------------
create table if not exists public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  year        int not null check (year between 2000 and 2100),
  created_at  timestamptz not null default now(),
  unique (teacher_id, year)
);

create table if not exists public.periods (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years (id) on delete cascade,
  name              text not null,               -- "I/2026", "II/2026", "Invierno", "Verano"
  starts_on         date,
  ends_on           date,
  created_at        timestamptz not null default now()
);

create table if not exists public.subjects (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  period_id    uuid not null references public.periods (id) on delete cascade,
  code         text not null,                   -- sigla, ej. TSOS 023
  name         text not null,
  career       text,
  semester     text,
  parallel     text not null default 'A',
  theme_color  text default '#1B7339',
  cover_url    text,
  created_at   timestamptz not null default now()
);

create table if not exists public.students (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  university_code  text not null,               -- RU
  ci               text,
  last_names       text not null,
  first_names      text not null,
  email            text,
  career           text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (teacher_id, university_code)
);

create table if not exists public.enrollments (
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  teacher_id   uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (subject_id, student_id)
);

create table if not exists public.topics (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  name         text not null,
  unit         text,
  description  text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Plan de calificación (conversor de notas)
-- ---------------------------------------------------------------------
create table if not exists public.grading_plans (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  subject_id  uuid not null unique references public.subjects (id) on delete cascade,
  name        text not null default 'Plan de calificación',
  max_score   numeric not null default 100,
  pass_mark   numeric not null default 51,
  created_at  timestamptz not null default now()
);

create table if not exists public.grading_items (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  plan_id     uuid not null references public.grading_plans (id) on delete cascade,
  term        int not null check (term between 1 and 6),          -- parcial
  category    text not null,                                     -- "Examen y pruebas escritas"
  weight      numeric not null check (weight >= 0),              -- puntos que aporta
  source      text not null default 'yaguarquiz' check (source in ('yaguarquiz', 'manual')),
  sort_order  int not null default 0,
  unique (plan_id, term, category)
);

-- ---------------------------------------------------------------------
-- Evaluaciones y banco de preguntas
-- ---------------------------------------------------------------------
create table if not exists public.quizzes (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  subject_id    uuid not null references public.subjects (id) on delete cascade,
  topic_id      uuid references public.topics (id) on delete set null,
  title         text not null,
  description   text,
  cover_url     text,
  visual_theme  text not null default 'amazonia',
  settings      jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.questions (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  quiz_id           uuid not null references public.quizzes (id) on delete cascade,
  sort_order        int not null default 0,
  type              text not null check (type in (
                      'single', 'multiple', 'true_false', 'short_text', 'ordering', 'image_choice',
                      'matching', 'fill_blank', 'numeric', 'poll', 'open', 'hotspot', 'word_cloud')),
  prompt            text not null,
  image_url         text,
  video_url         text,
  time_limit_sec    int not null default 20 check (time_limit_sec between 5 and 600),
  base_points       int not null default 1000 check (base_points in (0, 1000, 2000)),
  difficulty        text check (difficulty in ('facil', 'media', 'dificil')),
  explanation       text,
  tags              text[] not null default '{}',
  accepted_answers  text[] not null default '{}',   -- short_text
  numeric_answer    numeric,                         -- numeric
  numeric_tolerance numeric,
  term              text,                            -- para juegos tipo Educaplay
  definition        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.question_options (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  question_id       uuid not null references public.questions (id) on delete cascade,
  text              text not null default '',
  image_url         text,
  is_correct        boolean not null default false,
  sort_order        int not null default 0,
  match_pair        text,            -- matching
  correct_position  int              -- ordering
);

-- ---------------------------------------------------------------------
-- Sesiones (cada aplicación de una evaluación), participantes y respuestas
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  teacher_id           uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  quiz_id              uuid not null references public.quizzes (id) on delete cascade,
  subject_id           uuid not null references public.subjects (id) on delete cascade,
  grading_item_id      uuid references public.grading_items (id) on delete set null,
  pin                  text not null check (pin ~ '^[0-9]{6}$'),
  mode                 text not null default 'live' check (mode in ('live', 'exam', 'homework')),
  status               text not null default 'scheduled'
                         check (status in ('scheduled', 'lobby', 'running', 'paused', 'finished')),
  scheduled_start      timestamptz,
  scheduled_end        timestamptz,
  current_question     int,
  question_started_at  timestamptz,
  settings             jsonb not null default '{}'::jsonb,   -- configuración congelada
  created_at           timestamptz not null default now(),
  finished_at          timestamptz
);
-- El PIN es único solo entre sesiones no finalizadas
create unique index if not exists sessions_active_pin on public.sessions (pin) where status <> 'finished';

create table if not exists public.participants (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.teachers (id) on delete cascade,
  session_id        uuid not null references public.sessions (id) on delete cascade,
  student_id        uuid references public.students (id) on delete set null,
  nickname          text not null,
  avatar            jsonb not null default '{}'::jsonb,
  token             uuid not null default gen_random_uuid() unique,
  connected         boolean not null default true,
  last_ping         timestamptz not null default now(),
  total_score       int not null default 0,
  streak            int not null default 0,
  tab_switch_count  int not null default 0,
  paste_count       int not null default 0,
  extra_time_sec    int not null default 0,
  joined_at         timestamptz not null default now(),
  unique (session_id, student_id)
);

create table if not exists public.answers (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  session_id      uuid not null references public.sessions (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  question_id     uuid not null references public.questions (id) on delete cascade,
  response        jsonb not null,
  is_correct      boolean,
  partial_score   numeric not null default 0 check (partial_score between 0 and 1),
  time_ms         int,
  game_points     int not null default 0,
  manual_score    numeric,           -- calificación manual (preguntas abiertas)
  answered_at     timestamptz not null default now(),
  unique (participant_id, question_id)
);

create table if not exists public.grade_adjustments (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  old_score       numeric,
  new_score       numeric not null,
  reason          text not null,
  created_at      timestamptz not null default now()
);

create table if not exists public.sheet_sync_log (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  status      text not null check (status in ('ok', 'error')),
  error       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.teacher_settings (
  teacher_id        uuid primary key default auth.uid() references public.teachers (id) on delete cascade,
  sheets_webapp_url text,
  sheets_token      text,
  preferences       jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);

-- Índices útiles
create index if not exists idx_periods_year      on public.periods (academic_year_id);
create index if not exists idx_subjects_period   on public.subjects (period_id);
create index if not exists idx_topics_subject    on public.topics (subject_id);
create index if not exists idx_quizzes_subject   on public.quizzes (subject_id);
create index if not exists idx_questions_quiz    on public.questions (quiz_id, sort_order);
create index if not exists idx_options_question  on public.question_options (question_id, sort_order);
create index if not exists idx_sessions_quiz     on public.sessions (quiz_id);
create index if not exists idx_participants_sess on public.participants (session_id);
create index if not exists idx_answers_session   on public.answers (session_id);
create index if not exists idx_enroll_student    on public.enrollments (student_id);

drop trigger if exists quizzes_updated on public.quizzes;
create trigger quizzes_updated before update on public.quizzes
  for each row execute function public.set_updated_at();
drop trigger if exists questions_updated on public.questions;
create trigger questions_updated before update on public.questions
  for each row execute function public.set_updated_at();

-- =====================================================================
-- SEGURIDAD: RLS en todas las tablas. El rol "anon" (visitantes y
-- estudiantes) NO tiene acceso directo a ninguna tabla: los estudiantes
-- solo usarán funciones RPC controladas (Fase 4).
-- =====================================================================
do $$
declare
  t text;
  tables text[] := array[
    'teachers', 'academic_years', 'periods', 'subjects', 'students', 'enrollments', 'topics',
    'grading_plans', 'grading_items', 'quizzes', 'questions', 'question_options', 'sessions',
    'participants', 'answers', 'grade_adjustments', 'sheet_sync_log', 'teacher_settings'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Políticas genéricas: cada docente aprobado solo ve y modifica lo suyo.
do $$
declare
  t text;
  owned text[] := array[
    'academic_years', 'periods', 'subjects', 'students', 'enrollments', 'topics',
    'grading_plans', 'grading_items', 'quizzes', 'questions', 'question_options', 'sessions',
    'participants', 'answers', 'grade_adjustments', 'sheet_sync_log', 'teacher_settings'];
begin
  foreach t in array owned loop
    execute format('drop policy if exists owner_select on public.%I', t);
    execute format('drop policy if exists owner_insert on public.%I', t);
    execute format('drop policy if exists owner_update on public.%I', t);
    execute format('drop policy if exists owner_delete on public.%I', t);
    execute format($p$create policy owner_select on public.%I for select to authenticated
                     using (teacher_id = (select auth.uid()) and (select public.is_teacher()))$p$, t);
    execute format($p$create policy owner_update on public.%I for update to authenticated
                     using (teacher_id = (select auth.uid()) and (select public.is_teacher()))
                     with check (teacher_id = (select auth.uid()))$p$, t);
    execute format($p$create policy owner_delete on public.%I for delete to authenticated
                     using (teacher_id = (select auth.uid()) and (select public.is_teacher()))$p$, t);
  end loop;
end $$;

-- Inserción: además de ser dueño, el "padre" también debe ser suyo
-- (evita colgar datos en registros de otro docente).
create or replace function public.owns(tbl text, row_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare ok boolean;
begin
  if row_id is null then return true; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and teacher_id = auth.uid())', tbl)
    into ok using row_id;
  return ok;
end $$;

drop policy if exists owner_insert on public.academic_years;
create policy owner_insert on public.academic_years for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()));
drop policy if exists owner_insert on public.periods;
create policy owner_insert on public.periods for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('academic_years', academic_year_id));
drop policy if exists owner_insert on public.subjects;
create policy owner_insert on public.subjects for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('periods', period_id));
drop policy if exists owner_insert on public.students;
create policy owner_insert on public.students for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()));
drop policy if exists owner_insert on public.enrollments;
create policy owner_insert on public.enrollments for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher())
              and public.owns('subjects', subject_id) and public.owns('students', student_id));
drop policy if exists owner_insert on public.topics;
create policy owner_insert on public.topics for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('subjects', subject_id));
drop policy if exists owner_insert on public.grading_plans;
create policy owner_insert on public.grading_plans for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('subjects', subject_id));
drop policy if exists owner_insert on public.grading_items;
create policy owner_insert on public.grading_items for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('grading_plans', plan_id));
drop policy if exists owner_insert on public.quizzes;
create policy owner_insert on public.quizzes for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher())
              and public.owns('subjects', subject_id) and public.owns('topics', topic_id));
drop policy if exists owner_insert on public.questions;
create policy owner_insert on public.questions for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('quizzes', quiz_id));
drop policy if exists owner_insert on public.question_options;
create policy owner_insert on public.question_options for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('questions', question_id));
drop policy if exists owner_insert on public.sessions;
create policy owner_insert on public.sessions for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher())
              and public.owns('quizzes', quiz_id) and public.owns('subjects', subject_id)
              and public.owns('grading_items', grading_item_id));
-- participants y answers: los crean solo las funciones RPC de la Fase 4
drop policy if exists owner_insert on public.participants;
drop policy if exists owner_insert on public.answers;
drop policy if exists owner_insert on public.grade_adjustments;
create policy owner_insert on public.grade_adjustments for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('participants', participant_id));
drop policy if exists owner_insert on public.sheet_sync_log;
create policy owner_insert on public.sheet_sync_log for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()) and public.owns('sessions', session_id));
drop policy if exists owner_insert on public.teacher_settings;
create policy owner_insert on public.teacher_settings for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_teacher()));

-- teachers: cada uno ve su ficha; el administrador ve y aprueba a todos
drop policy if exists teachers_select on public.teachers;
create policy teachers_select on public.teachers for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists teachers_update on public.teachers;
create policy teachers_update on public.teachers for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
revoke insert, delete on public.teachers from authenticated;

-- ---------------------------------------------------------------------
-- Funciones públicas
-- ---------------------------------------------------------------------
-- Mantener activo el proyecto gratuito (lo llama el GitHub Action semanal)
create or replace function public.keep_alive()
returns text language sql security definer set search_path = '' as $$
  select 'ok ' || count(*)::text from public.teachers;
$$;
revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;

-- Hora del servidor (para sincronizar cronómetros)
create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.server_time() to anon, authenticated;

-- Resumen para el panel del docente
create or replace function public.dashboard_counts()
returns json language sql stable security invoker set search_path = '' as $$
  select json_build_object(
    'subjects',  (select count(*) from public.subjects),
    'students',  (select count(*) from public.students),
    'quizzes',   (select count(*) from public.quizzes),
    'questions', (select count(*) from public.questions),
    'sessions',  (select count(*) from public.sessions)
  );
$$;
revoke all on function public.dashboard_counts() from public, anon;
grant execute on function public.dashboard_counts() to authenticated;

-- Las funciones auxiliares no deben ser llamables por visitantes
revoke all on function public.is_teacher() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.owns(text, uuid) from public, anon;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.owns(text, uuid) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_teacher_fields() from public, anon, authenticated;
