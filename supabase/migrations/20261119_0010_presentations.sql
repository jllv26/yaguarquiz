-- =====================================================================
-- YaguarQuiz UAP — Fase 10: exposiciones con evaluación entre pares (antes "Copa Salvando el Semestre")
--   * El docente arma los expositores (grupo, tema, día y orden) desde la lista oficial de la asignatura.
--   * Los estudiantes entran con PIN + RU (+CI) desde el celular o la PC del laboratorio y califican con la
--     rúbrica a cada compañero que pasa al frente (nunca a sí mismos ni a su propio grupo) y explican su nota.
--   * El docente también califica con la misma rúbrica. Nota final (0-100) = peso del docente × su nota
--     + (1 − peso) × promedio de los compañeros. Ausente = 0.
--   * Cronómetro sin límite: se guarda cuánto expuso cada uno.
-- Seguridad: los estudiantes no leen tablas; todo pasa por funciones que validan su ficha (token).
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

create table if not exists public.presentations (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  subject_id         uuid not null references public.subjects (id) on delete cascade,
  topic_id           uuid references public.topics (id) on delete set null,
  grading_item_id    uuid references public.grading_items (id) on delete set null,
  title              text not null,
  rubric             jsonb not null,
  settings           jsonb not null default '{}'::jsonb,
  pin                text not null check (pin ~ '^[0-9]{6}$'),
  status             text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  current_presenter  uuid,
  current_day        int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists presentations_active_pin on public.presentations (pin) where status <> 'closed';

create table if not exists public.presentation_presenters (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  presentation_id  uuid not null references public.presentations (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  group_no         int,
  topic            text,
  day              int not null default 1 check (day between 1 and 10),
  sort_order       int not null default 0,
  state            text not null default 'pending' check (state in ('pending', 'live', 'done', 'absent')),
  started_at       timestamptz,
  duration_sec     int,
  teacher_scores   int[],
  teacher_comment  text,
  unique (presentation_id, student_id)
);
create index if not exists idx_pres_presenters on public.presentation_presenters (presentation_id, day, sort_order);

create table if not exists public.presentation_participants (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  presentation_id  uuid not null references public.presentations (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  token            uuid not null default gen_random_uuid() unique,
  device_id        text,
  joined_at        timestamptz not null default now(),
  last_ping        timestamptz not null default now(),
  unique (presentation_id, student_id)
);

create table if not exists public.presentation_reviews (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  presentation_id  uuid not null references public.presentations (id) on delete cascade,
  presenter_id     uuid not null references public.presentation_presenters (id) on delete cascade,
  participant_id   uuid not null references public.presentation_participants (id) on delete cascade,
  scores           int[] not null,
  why              text not null default '',
  understood       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (presenter_id, participant_id)
);
create index if not exists idx_pres_reviews on public.presentation_reviews (presentation_id, presenter_id);

do $$
declare t text;
begin
  foreach t in array array['presentations', 'presentation_presenters', 'presentation_participants', 'presentation_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_select on public.%I', t);
    execute format('create policy owner_select on public.%I for select to authenticated using (teacher_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Un PIN de exposición no puede coincidir con el de una sesión activa (y al revés)
create or replace function public._sessions_pin_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i int := 0;
begin
  while exists (select 1 from public.presentations where pin = new.pin and status <> 'closed') loop
    i := i + 1;
    new.pin := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when i > 50;
  end loop;
  return new;
end $$;
drop trigger if exists sessions_pin_guard on public.sessions;
create trigger sessions_pin_guard before insert on public.sessions for each row execute function public._sessions_pin_guard();

create or replace function public._new_pres_pin()
returns text language plpgsql security definer set search_path = '' as $$
declare v text; i int := 0;
begin
  loop
    i := i + 1;
    v := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (select 1 from public.presentations where pin = v and status <> 'closed')
          and not exists (select 1 from public.sessions where pin = v and status <> 'finished');
    if i > 50 then raise exception 'No se pudo generar un PIN, intente de nuevo'; end if;
  end loop;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Rúbrica: { levels: [{ v, label, emoji, hint }], criteria: [{ title, question, icon, levels: { "<v>": "descripción" } }] }
-- Puntaje (0-100) de un juego de notas: suma ÷ (criterios × nivel máximo) × 100
-- (con la rúbrica de la Copa: 13 de 15 → 86,67, igual que 4,33 sobre 5)
-- ---------------------------------------------------------------------
create or replace function public._rubric_max(p_rubric jsonb)
returns int language sql immutable set search_path = '' as $$
  select max((l ->> 'v')::int) from jsonb_array_elements(p_rubric -> 'levels') l;
$$;

create or replace function public._rubric_valid(p_rubric jsonb, p_scores int[])
returns boolean language sql immutable set search_path = '' as $$
  select p_scores is not null
     and coalesce(array_length(p_scores, 1), 0) = jsonb_array_length(p_rubric -> 'criteria')
     and not exists (select 1 from unnest(p_scores) s
                      where not exists (select 1 from jsonb_array_elements(p_rubric -> 'levels') l where (l ->> 'v')::int = s));
$$;

create or replace function public._pres_score(p_scores int[], p_rubric jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case when p_scores is null or coalesce(array_length(p_scores, 1), 0) = 0 or public._rubric_max(p_rubric) is null then null
              else round(100.0 * (select sum(s) from unnest(p_scores) s) / (array_length(p_scores, 1) * public._rubric_max(p_rubric)), 2) end;
$$;

create or replace function public._short_name(p_first text, p_last text)
returns text language sql immutable set search_path = '' as $$
  select btrim(split_part(btrim(coalesce(p_first, '')), ' ', 1) || ' ' || split_part(btrim(coalesce(p_last, '')), ' ', 1));
$$;

-- Notas por expositor
create or replace function public._presentation_grades(p_pres uuid)
returns table (presenter_id uuid, student_id uuid, code text, name text, group_no int, topic text, day int, sort_order int,
               state text, duration_sec int, peer_n int, peer_avg numeric, teacher numeric, final numeric, criteria jsonb)
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.presentations where id = p_pres),
  w as (select greatest(0, least(100, coalesce((p.settings ->> 'teacher_weight')::numeric, 50))) / 100.0 as tw, p.rubric from p),
  r as (
    select rv.presenter_id, count(*)::int as n, round(avg(public._pres_score(rv.scores, w.rubric)), 2) as avg_
      from public.presentation_reviews rv, w where rv.presentation_id = p_pres group by rv.presenter_id)
  select pp.id, s.id, s.university_code, s.last_names || ', ' || s.first_names, pp.group_no, pp.topic, pp.day, pp.sort_order,
         pp.state, pp.duration_sec, coalesce(r.n, 0), r.avg_, public._pres_score(pp.teacher_scores, w.rubric),
         case when pp.state = 'absent' then 0
              when r.avg_ is not null and pp.teacher_scores is not null
                then round(w.tw * public._pres_score(pp.teacher_scores, w.rubric) + (1 - w.tw) * r.avg_, 2)
              when r.avg_ is not null then r.avg_
              else public._pres_score(pp.teacher_scores, w.rubric) end,
         (select jsonb_agg(x.a order by x.k) from (
            select k, round(avg(rv.scores[k])::numeric, 2) as a
              from public.presentation_reviews rv, generate_subscripts(rv.scores, 1) k
             where rv.presenter_id = pp.id group by k) x)
    from public.presentation_presenters pp
    join public.students s on s.id = pp.student_id
    cross join w
    left join r on r.presenter_id = pp.id
   where pp.presentation_id = p_pres
   order by pp.day, pp.sort_order, s.last_names;
$$;

-- ---------------------------------------------------------------------
-- DOCENTE
-- ---------------------------------------------------------------------
-- p: { id?, subject_id, topic_id?, title, rubric, settings, grading_item_id?,
--      presenters: [{ student_id, group_no, topic, day, sort_order }] }
create or replace function public.save_presentation(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_subject uuid := (p ->> 'subject_id')::uuid;
  v_item uuid := nullif(p ->> 'grading_item_id', '')::uuid;
  v_rubric jsonb := p -> 'rubric';
  x jsonb;
  v_keep uuid[] := '{}';
  i int := 0;
begin
  if not public.is_teacher() then raise exception 'Solo un docente aprobado puede crear exposiciones'; end if;
  if not exists (select 1 from public.subjects where id = v_subject and teacher_id = v_uid) then raise exception 'La asignatura no existe o no es suya'; end if;
  if btrim(coalesce(p ->> 'title', '')) = '' then raise exception 'Escriba el título de la exposición'; end if;
  if jsonb_typeof(v_rubric -> 'criteria') <> 'array' or jsonb_array_length(v_rubric -> 'criteria') not between 1 and 10 then
    raise exception 'La rúbrica debe tener entre 1 y 10 criterios';
  end if;
  if jsonb_typeof(v_rubric -> 'levels') <> 'array' or jsonb_array_length(v_rubric -> 'levels') not between 2 and 6 then
    raise exception 'La rúbrica debe tener entre 2 y 6 niveles';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rubric -> 'levels') l where (l ->> 'v') is null or (l ->> 'v')::int not between 0 and 10) then
    raise exception 'Cada nivel debe valer entre 0 y 10 puntos';
  end if;
  if v_item is not null and not exists (
    select 1 from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id
     where gi.id = v_item and gp.subject_id = v_subject and gi.teacher_id = v_uid) then
    raise exception 'La categoría de la libreta no corresponde a la asignatura';
  end if;

  if v_id is null then
    insert into public.presentations (teacher_id, subject_id, topic_id, grading_item_id, title, rubric, settings, pin)
    values (v_uid, v_subject, nullif(p ->> 'topic_id', '')::uuid, v_item, btrim(p ->> 'title'), v_rubric,
            coalesce(p -> 'settings', '{}'::jsonb), public._new_pres_pin())
    returning id into v_id;
  else
    update public.presentations
       set subject_id = v_subject, topic_id = nullif(p ->> 'topic_id', '')::uuid, grading_item_id = v_item,
           title = btrim(p ->> 'title'), rubric = v_rubric, settings = coalesce(p -> 'settings', '{}'::jsonb), updated_at = now()
     where id = v_id and teacher_id = v_uid;
    if not found then raise exception 'La exposición no existe o no es suya'; end if;
    -- si cambia el número de criterios, las notas anteriores ya no sirven
    if exists (select 1 from public.presentation_reviews where presentation_id = v_id
                and array_length(scores, 1) <> jsonb_array_length(v_rubric -> 'criteria')) then
      raise exception 'Ya hay calificaciones con otra cantidad de criterios. Borre las pruebas antes de cambiar la rúbrica.';
    end if;
  end if;

  if p ? 'presenters' then
    for x in select * from jsonb_array_elements(p -> 'presenters') loop
      i := i + 1;
      if not exists (select 1 from public.enrollments e where e.student_id = (x ->> 'student_id')::uuid and e.subject_id = v_subject) then
        raise exception 'Un expositor no está inscrito en la asignatura';
      end if;
      insert into public.presentation_presenters (teacher_id, presentation_id, student_id, group_no, topic, day, sort_order)
      values (v_uid, v_id, (x ->> 'student_id')::uuid, nullif(x ->> 'group_no', '')::int, nullif(btrim(coalesce(x ->> 'topic', '')), ''),
              greatest(1, least(10, coalesce(nullif(x ->> 'day', '')::int, 1))), coalesce(nullif(x ->> 'sort_order', '')::int, i))
      on conflict (presentation_id, student_id) do update
         set group_no = excluded.group_no, topic = excluded.topic, day = excluded.day, sort_order = excluded.sort_order;
      v_keep := v_keep || (x ->> 'student_id')::uuid;
    end loop;
    delete from public.presentation_presenters where presentation_id = v_id and not (student_id = any (v_keep));
  end if;
  return v_id;
end $$;

create or replace function public._own_presentation(p_id uuid)
returns public.presentations language plpgsql stable security definer set search_path = '' as $$
declare r public.presentations;
begin
  select * into r from public.presentations where id = p_id and teacher_id = auth.uid();
  if r.id is null then raise exception 'La exposición no existe o no es suya'; end if;
  return r;
end $$;

-- Estado completo para el panel del docente y el proyector
create or replace function public.presentation_host(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.presentations;
begin
  r := public._own_presentation(p_id);
  return jsonb_build_object(
    'server_now', now(),
    'presentation', jsonb_build_object('id', r.id, 'title', r.title, 'pin', r.pin, 'status', r.status, 'rubric', r.rubric,
                                       'settings', r.settings, 'current_presenter', r.current_presenter, 'current_day', r.current_day,
                                       'grading_item_id', r.grading_item_id,
                                       'subject', (select jsonb_build_object('id', s.id, 'code', s.code, 'parallel', s.parallel, 'name', s.name)
                                                     from public.subjects s where s.id = r.subject_id)),
    'presenters', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.presenter_id, 'student_id', g.student_id, 'code', g.code, 'name', g.name, 'group_no', g.group_no, 'topic', g.topic,
        'day', g.day, 'sort_order', g.sort_order, 'state', g.state, 'duration_sec', g.duration_sec,
        'started_at', pp.started_at, 'peer_n', g.peer_n, 'peer_avg', g.peer_avg, 'teacher', g.teacher, 'final', g.final,
        'criteria', g.criteria, 'teacher_scores', to_jsonb(pp.teacher_scores), 'teacher_comment', pp.teacher_comment))
      from public._presentation_grades(r.id) g join public.presentation_presenters pp on pp.id = g.presenter_id), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pa.id, 'name', s.last_names || ', ' || s.first_names, 'code', s.university_code, 'joined_at', pa.joined_at,
        'online', pa.last_ping > now() - interval '45 seconds',
        'reviews', (select count(*) from public.presentation_reviews rv where rv.participant_id = pa.id)) order by s.last_names)
      from public.presentation_participants pa join public.students s on s.id = pa.student_id where pa.presentation_id = r.id), '[]'::jsonb),
    'enrolled', (select count(*) from public.enrollments e where e.subject_id = r.subject_id and e.active),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', gi.id, 'term', gi.term, 'category', gi.category, 'weight', gi.weight)
                                        order by gi.term, gi.sort_order)
                         from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id
                        where gp.subject_id = r.subject_id and gi.source = 'manual'), '[]'::jsonb));
end $$;

-- Lista de exposiciones del docente
create or replace function public.presentation_list()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'title', p.title, 'status', p.status, 'pin', p.pin, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'subject', jsonb_build_object('id', s.id, 'code', s.code, 'parallel', s.parallel, 'name', s.name, 'theme_color', s.theme_color),
           'presenters', (select count(*) from public.presentation_presenters x where x.presentation_id = p.id),
           'done', (select count(*) from public.presentation_presenters x where x.presentation_id = p.id and x.state in ('done', 'absent')),
           'reviews', (select count(*) from public.presentation_reviews x where x.presentation_id = p.id))
           order by p.updated_at desc), '[]'::jsonb)
    from public.presentations p join public.subjects s on s.id = p.subject_id
   where p.teacher_id = auth.uid();
$$;

-- Estudiantes inscritos de una asignatura (para armar los grupos)
create or replace function public.presentation_roster(p_subject uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'code', s.university_code, 'name', s.last_names || ', ' || s.first_names)
                            order by s.last_names, s.first_names), '[]'::jsonb)
    from public.enrollments e join public.students s on s.id = e.student_id
   where e.subject_id = p_subject and e.active and s.active and s.teacher_id = auth.uid();
$$;

create or replace function public.delete_presentation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._own_presentation(p_id);
  delete from public.presentations where id = p_id;
end $$;

-- Control en vivo: open | close | next | start | end | absent | undo | reset_timer | day | release | clear_tests | new_pin
create or replace function public.presentation_control(p_id uuid, p_action text, p_target uuid default null, p_arg int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.presentations; v_next uuid;
begin
  r := public._own_presentation(p_id);
  -- cierra la exposición en curso guardando cuánto duró
  if p_action in ('next', 'start', 'end', 'absent', 'undo') and r.current_presenter is not null
     and (p_action <> 'absent' and p_action <> 'undo' or p_target = r.current_presenter) then
    update public.presentation_presenters
       set state = case when p_action = 'absent' then 'absent' when p_action = 'undo' then 'pending' else 'done' end,
           duration_sec = case when p_action in ('absent', 'undo') then null
                               else greatest(0, extract(epoch from now() - started_at)::int) end,
           started_at = case when p_action = 'undo' then null else started_at end
     where id = r.current_presenter and state = 'live';
    update public.presentations set current_presenter = null where id = r.id;
  end if;

  if p_action = 'open' then
    update public.presentations set status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'close' then
    update public.presentations set status = 'closed', current_presenter = null, updated_at = now() where id = r.id;
  elsif p_action = 'reopen' then
    if exists (select 1 from public.presentations where pin = r.pin and status <> 'closed' and id <> r.id)
       or exists (select 1 from public.sessions where pin = r.pin and status <> 'finished') then
      update public.presentations set pin = public._new_pres_pin() where id = r.id;
    end if;
    update public.presentations set status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'next' then
    select id into v_next from public.presentation_presenters
     where presentation_id = r.id and state = 'pending' and day = r.current_day order by sort_order, id limit 1;
    if v_next is null then return jsonb_build_object('ok', false, 'error', 'no_pending'); end if;
    update public.presentation_presenters set state = 'live', started_at = now(), duration_sec = null where id = v_next;
    update public.presentations set current_presenter = v_next, status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'start' then
    if not exists (select 1 from public.presentation_presenters where id = p_target and presentation_id = r.id) then raise exception 'Expositor no válido'; end if;
    update public.presentation_presenters set state = 'live', started_at = now(), duration_sec = null where id = p_target;
    update public.presentations set current_presenter = p_target, status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'absent' then
    update public.presentation_presenters set state = 'absent', started_at = null, duration_sec = null
     where id = p_target and presentation_id = r.id;
  elsif p_action = 'undo' then
    -- vuelve a "pendiente" y borra lo que recibió (como reiniciar en la Copa)
    delete from public.presentation_reviews where presenter_id = p_target and presentation_id = r.id;
    update public.presentation_presenters set state = 'pending', started_at = null, duration_sec = null
     where id = p_target and presentation_id = r.id;
  elsif p_action = 'reset_timer' then
    update public.presentation_presenters set started_at = now() where id = r.current_presenter and state = 'live';
  elsif p_action = 'day' then
    update public.presentations set current_day = greatest(1, least(10, coalesce(p_arg, 1))) where id = r.id;
  elsif p_action = 'release' then
    update public.presentation_participants set device_id = null where id = p_target and presentation_id = r.id;
  elsif p_action = 'clear_tests' then
    delete from public.presentation_reviews where presentation_id = r.id;
    delete from public.presentation_participants where presentation_id = r.id;
    update public.presentation_presenters set state = 'pending', started_at = null, duration_sec = null, teacher_scores = null, teacher_comment = null
     where presentation_id = r.id;
    update public.presentations set current_presenter = null where id = r.id;
  elsif p_action = 'new_pin' then
    update public.presentations set pin = public._new_pres_pin() where id = r.id;
  elsif p_action <> 'end' then
    raise exception 'Acción no válida';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Calificación del docente (null = borrar)
create or replace function public.presentation_teacher_score(p_presenter uuid, p_scores int[], p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.presentations; pp public.presentation_presenters;
begin
  select * into pp from public.presentation_presenters where id = p_presenter and teacher_id = auth.uid();
  if pp.id is null then raise exception 'El expositor no existe o no es suyo'; end if;
  select * into r from public.presentations where id = pp.presentation_id;
  if p_scores is not null and not public._rubric_valid(r.rubric, p_scores) then raise exception 'Califique todos los criterios'; end if;
  update public.presentation_presenters set teacher_scores = p_scores, teacher_comment = nullif(btrim(coalesce(p_comment, '')), '')
   where id = pp.id;
  return jsonb_build_object('ok', true, 'score', public._pres_score(p_scores, r.rubric));
end $$;

-- Detalle de lo que escribió cada compañero sobre un expositor
create or replace function public.presentation_reviews_of(p_presenter uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'evaluator', s.last_names || ', ' || s.first_names, 'code', s.university_code, 'scores', to_jsonb(rv.scores),
           'score', public._pres_score(rv.scores, p.rubric), 'why', rv.why, 'understood', rv.understood, 'at', rv.updated_at)
           order by rv.updated_at), '[]'::jsonb)
    from public.presentation_reviews rv
    join public.presentations p on p.id = rv.presentation_id
    join public.presentation_participants pa on pa.id = rv.participant_id
    join public.students s on s.id = pa.student_id
   where rv.presenter_id = p_presenter and p.teacher_id = auth.uid();
$$;

-- Pasa las notas finales a la libreta (categoría manual del plan de calificación)
create or replace function public.presentation_to_gradebook(p_id uuid, p_item uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r public.presentations; n int := 0; g record;
begin
  r := public._own_presentation(p_id);
  if not exists (select 1 from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id
                  where gi.id = p_item and gp.subject_id = r.subject_id and gi.teacher_id = auth.uid() and gi.source = 'manual') then
    raise exception 'Elija una categoría manual del plan de calificación de esta asignatura (por ejemplo, Exposiciones)';
  end if;
  for g in select * from public._presentation_grades(r.id) where final is not null loop
    insert into public.manual_scores (teacher_id, grading_item_id, student_id, score)
    values (auth.uid(), p_item, g.student_id, g.final)
    on conflict (grading_item_id, student_id) do update set score = excluded.score, updated_at = now();
    n := n + 1;
  end loop;
  update public.presentations set grading_item_id = p_item where id = r.id;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- ESTUDIANTE
-- ---------------------------------------------------------------------
create or replace function public.presentation_info(p_pin text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.presentations;
begin
  select * into r from public.presentations where pin = btrim(p_pin) and status <> 'closed' order by created_at desc limit 1;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  return jsonb_build_object('ok', true, 'kind', 'presentation', 'title', r.title, 'status', r.status,
                            'require_ci', coalesce((r.settings ->> 'require_ci')::boolean, false),
                            'subject', (select code || ' · ' || name from public.subjects where id = r.subject_id));
end $$;

create or replace function public.presentation_lookup(p_pin text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.presentations; st public.students;
begin
  select * into r from public.presentations where pin = btrim(p_pin) and status <> 'closed' order by created_at desc limit 1;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  select s.* into st from public.students s join public.enrollments e on e.student_id = s.id and e.subject_id = r.subject_id and e.active
   where s.teacher_id = r.teacher_id and upper(regexp_replace(s.university_code, '\s+', '', 'g')) = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
   limit 1;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'not_enrolled'); end if;
  return jsonb_build_object('ok', true, 'name', st.last_names || ', ' || st.first_names,
                            'require_ci', coalesce((r.settings ->> 'require_ci')::boolean, false));
end $$;

create or replace function public.presentation_join(p_pin text, p_code text, p_ci text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.presentations; st public.students; pa public.presentation_participants;
begin
  select * into r from public.presentations where pin = btrim(p_pin) and status <> 'closed' order by created_at desc limit 1;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  select s.* into st from public.students s join public.enrollments e on e.student_id = s.id and e.subject_id = r.subject_id and e.active
   where s.teacher_id = r.teacher_id and upper(regexp_replace(s.university_code, '\s+', '', 'g')) = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
   limit 1;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'not_enrolled'); end if;
  if coalesce((r.settings ->> 'require_ci')::boolean, false) and
     (st.ci is null or right(regexp_replace(st.ci, '\D', '', 'g'), 3) <> right(regexp_replace(coalesce(p_ci, ''), '\D', '', 'g'), 3)
      or length(regexp_replace(coalesce(p_ci, ''), '\D', '', 'g')) < 3) then
    return jsonb_build_object('ok', false, 'error', 'bad_ci');
  end if;
  select * into pa from public.presentation_participants where presentation_id = r.id and student_id = st.id;
  if pa.id is not null then
    if pa.device_id is not null and p_device is not null and pa.device_id <> p_device then
      return jsonb_build_object('ok', false, 'error', 'other_device');
    end if;
    update public.presentation_participants set device_id = coalesce(device_id, p_device), last_ping = now() where id = pa.id;
    return jsonb_build_object('ok', true, 'token', pa.token, 'rejoined', true);
  end if;
  insert into public.presentation_participants (teacher_id, presentation_id, student_id, device_id)
  values (r.teacher_id, r.id, st.id, p_device)
  on conflict (presentation_id, student_id) do nothing
  returning * into pa;
  if pa.id is null then select * into pa from public.presentation_participants where presentation_id = r.id and student_id = st.id; end if;
  return jsonb_build_object('ok', true, 'token', pa.token, 'rejoined', false);
end $$;

create or replace function public.presentation_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pa public.presentation_participants; r public.presentations; me public.presentation_presenters; st public.students;
begin
  select * into pa from public.presentation_participants where token = p_token;
  if pa.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  select * into r from public.presentations where id = pa.presentation_id;
  select * into st from public.students where id = pa.student_id;
  select * into me from public.presentation_presenters where presentation_id = r.id and student_id = pa.student_id;
  update public.presentation_participants set last_ping = now() where id = pa.id;
  return jsonb_build_object(
    'ok', true, 'server_now', now(),
    'presentation', jsonb_build_object('title', r.title, 'status', r.status, 'rubric', r.rubric, 'current_day', r.current_day,
                                       'min_why', coalesce((r.settings ->> 'min_why')::int, 15),
                                       'min_understood', coalesce((r.settings ->> 'min_understood')::int, 25),
                                       'subject', (select code || ' · ' || name from public.subjects where id = r.subject_id)),
    'me', jsonb_build_object('name', public._short_name(st.first_names, st.last_names), 'full_name', st.last_names || ', ' || st.first_names,
                             'presenter_id', me.id, 'group_no', me.group_no, 'topic', me.topic),
    'current', (select jsonb_build_object('id', pp.id, 'name', public._short_name(s.first_names, s.last_names), 'group_no', pp.group_no,
                                          'topic', pp.topic, 'started_at', pp.started_at)
                  from public.presentation_presenters pp join public.students s on s.id = pp.student_id
                 where pp.id = r.current_presenter and pp.state = 'live'),
    'agenda', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pp.id, 'name', public._short_name(s.first_names, s.last_names), 'group_no', pp.group_no, 'topic', pp.topic,
        'day', pp.day, 'state', pp.state,
        'mine', pp.student_id = pa.student_id,
        'own_group', pp.student_id <> pa.student_id and me.group_no is not null and pp.group_no = me.group_no
                     and coalesce((r.settings ->> 'block_own_group')::boolean, true),
        'review', (select jsonb_build_object('scores', to_jsonb(rv.scores), 'why', rv.why, 'understood', rv.understood)
                     from public.presentation_reviews rv where rv.presenter_id = pp.id and rv.participant_id = pa.id))
        order by pp.day, pp.sort_order)
      from public.presentation_presenters pp join public.students s on s.id = pp.student_id
     where pp.presentation_id = r.id), '[]'::jsonb));
end $$;

create or replace function public.presentation_review(p_token uuid, p_presenter uuid, p_scores int[], p_why text, p_understood text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pa public.presentation_participants; r public.presentations; pp public.presentation_presenters; me public.presentation_presenters;
        v_why text := btrim(coalesce(p_why, '')); v_und text := btrim(coalesce(p_understood, ''));
begin
  select * into pa from public.presentation_participants where token = p_token;
  if pa.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  select * into r from public.presentations where id = pa.presentation_id;
  if r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  select * into pp from public.presentation_presenters where id = p_presenter and presentation_id = r.id;
  if pp.id is null then return jsonb_build_object('ok', false, 'error', 'presenter'); end if;
  if pp.student_id = pa.student_id then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  select * into me from public.presentation_presenters where presentation_id = r.id and student_id = pa.student_id;
  if coalesce((r.settings ->> 'block_own_group')::boolean, true) and me.group_no is not null and pp.group_no = me.group_no then
    return jsonb_build_object('ok', false, 'error', 'own_group');
  end if;
  if pp.state = 'absent' then return jsonb_build_object('ok', false, 'error', 'absent'); end if;
  if pp.state not in ('live', 'done') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if not public._rubric_valid(r.rubric, p_scores) then return jsonb_build_object('ok', false, 'error', 'scores'); end if;
  if char_length(v_why) < coalesce((r.settings ->> 'min_why')::int, 15) then return jsonb_build_object('ok', false, 'error', 'why'); end if;
  if char_length(v_und) < coalesce((r.settings ->> 'min_understood')::int, 25) then return jsonb_build_object('ok', false, 'error', 'understood'); end if;
  if char_length(v_why) > 600 or char_length(v_und) > 600 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  insert into public.presentation_reviews (teacher_id, presentation_id, presenter_id, participant_id, scores, why, understood)
  values (r.teacher_id, r.id, pp.id, pa.id, p_scores, v_why, v_und)
  on conflict (presenter_id, participant_id) do update
     set scores = excluded.scores, why = excluded.why, understood = excluded.understood, updated_at = now();
  update public.presentation_participants set last_ping = now() where id = pa.id;
  return jsonb_build_object('ok', true, 'score', public._pres_score(p_scores, r.rubric));
end $$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public._sessions_pin_guard()', 'public._new_pres_pin()', 'public._presentation_grades(uuid)',
                           'public._own_presentation(uuid)', 'public._rubric_max(jsonb)', 'public._rubric_valid(jsonb, integer[])',
                           'public._pres_score(integer[], jsonb)', 'public._short_name(text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.save_presentation(jsonb)', 'public.presentation_host(uuid)',
                           'public.presentation_control(uuid, text, uuid, integer)', 'public.presentation_teacher_score(uuid, integer[], text)',
                           'public.presentation_reviews_of(uuid)', 'public.presentation_to_gradebook(uuid, uuid)',
                           'public.presentation_list()', 'public.presentation_roster(uuid)', 'public.delete_presentation(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.presentation_info(text)', 'public.presentation_lookup(text, text)',
                           'public.presentation_join(text, text, text, text)', 'public.presentation_state(uuid)',
                           'public.presentation_review(uuid, uuid, integer[], text, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
