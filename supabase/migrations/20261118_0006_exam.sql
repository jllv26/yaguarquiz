-- =====================================================================
-- YaguarQuiz UAP — Fase 5: examen de laboratorio y tarea/práctica
--   * Cada estudiante avanza a su ritmo dentro de un tiempo total.
--   * La actividad se abre y se cierra sola (fecha y hora); al vencer el tiempo se entrega sola.
--   * Preguntas al azar del banco y orden de preguntas/opciones distinto por estudiante.
--   * Intentos, modo enfoque (salidas de pestaña, bloqueo), revisión de respuestas configurable.
-- Seguridad: igual que el modo en vivo (el estudiante no lee tablas; la correcta nunca llega antes de tiempo).
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas y tablas nuevas
-- ---------------------------------------------------------------------
alter table public.sessions add column if not exists time_limit_sec int;            -- tiempo total por intento (null = sin límite)
alter table public.sessions add column if not exists max_attempts int not null default 1;
alter table public.sessions add column if not exists pick_count int;                -- preguntas al azar por estudiante (null = todas)
alter table public.sessions add column if not exists shuffle_questions boolean not null default true;
alter table public.sessions add column if not exists shuffle_options boolean not null default true;
alter table public.sessions add column if not exists show_correct text not null default 'after_close';
alter table public.sessions add column if not exists show_grade boolean not null default true;
alter table public.sessions add column if not exists focus_mode boolean not null default false;
alter table public.sessions add column if not exists lock_after int not null default 0;  -- 0 = solo registrar

do $$ begin
  alter table public.sessions add constraint sessions_show_correct_chk check (show_correct in ('each', 'end', 'after_close', 'never'));
exception when duplicate_object then null; end $$;

alter table public.participants add column if not exists extra_attempts int not null default 0;

create table if not exists public.attempts (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  session_id      uuid not null references public.sessions (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  number          int not null,
  question_ids    uuid[] not null,
  started_at      timestamptz not null default now(),
  deadline        timestamptz,                 -- inicio + tiempo total (sin contar tiempo extra ni cierre)
  submitted_at    timestamptz,
  submit_reason   text check (submit_reason in ('student', 'time', 'closed', 'teacher')),
  grade           numeric,
  correct_count   int,
  score           int,
  focus_losses    int not null default 0,
  paste_count     int not null default 0,
  locked          boolean not null default false,
  unique (participant_id, number)
);
create index if not exists idx_attempts_session on public.attempts (session_id);
create unique index if not exists attempts_one_open on public.attempts (participant_id) where submitted_at is null;

alter table public.attempts enable row level security;
drop policy if exists owner_select on public.attempts;
create policy owner_select on public.attempts for select to authenticated using (teacher_id = (select auth.uid()));
revoke all on public.attempts from anon;
grant select on public.attempts to authenticated;

-- Respuestas: en vivo hay una por pregunta; en examen, una por pregunta y por intento
alter table public.answers add column if not exists attempt_id uuid references public.attempts (id) on delete cascade;
alter table public.answers drop constraint if exists answers_participant_id_question_id_key;
create unique index if not exists answers_live_uq on public.answers (participant_id, question_id) where attempt_id is null;
create unique index if not exists answers_attempt_uq on public.answers (attempt_id, question_id) where attempt_id is not null;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
-- Estado de la ventana: 'not_open' | 'open' | 'closed' (según la hora del servidor)
create or replace function public._window(s public.sessions)
returns text language sql stable set search_path = '' as $$
  select case
    when s.status = 'finished' or (s.scheduled_end is not null and now() >= s.scheduled_end) then 'closed'
    when s.scheduled_start is not null and now() < s.scheduled_start then 'not_open'
    else 'open' end;
$$;

-- Hora límite real de un intento: tiempo total o cierre de la actividad (lo que llegue primero) + tiempo extra
create or replace function public._attempt_deadline(p_attempt uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select least(a.deadline, s.scheduled_end) + make_interval(secs => p.extra_time_sec)
    from public.attempts a
    join public.participants p on p.id = a.participant_id
    join public.sessions s on s.id = a.session_id
   where a.id = p_attempt;
$$;

-- Opciones en el orden que ve ESTE estudiante (mezcla fija por intento; "ordenar" nunca sale resuelto)
create or replace function public._attempt_question(p_question uuid, p_attempt uuid, p_shuffle boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_type text; v_ord uuid[]; v_ok uuid[]; v_out jsonb;
begin
  select type into v_type from public.questions where id = p_question;
  if v_type = 'ordering' or (p_shuffle and v_type not in ('true_false')) then
    select array_agg(id order by md5(p_attempt::text || id::text)) into v_ord from public.question_options where question_id = p_question;
    if v_type = 'ordering' then
      select array_agg(id order by correct_position) into v_ok from public.question_options where question_id = p_question;
      if v_ord = v_ok and array_length(v_ord, 1) > 1 then
        select array_agg(x order by i desc) into v_ord from unnest(v_ord) with ordinality as t(x, i);
      end if;
    end if;
  else
    select array_agg(id order by sort_order) into v_ord from public.question_options where question_id = p_question;
  end if;
  select jsonb_build_object(
    'id', q.id, 'type', q.type, 'prompt', q.prompt, 'image_url', q.image_url,
    'time_limit_sec', q.time_limit_sec, 'base_points', q.base_points,
    'options', coalesce((select jsonb_agg(jsonb_build_object('key', o.id, 'text', o.text, 'image_url', o.image_url)
                                          order by array_position(v_ord, o.id))
                           from public.question_options o where o.question_id = q.id), '[]'::jsonb))
    into v_out
    from public.questions q where q.id = p_question;
  return v_out;
end $$;

-- Califica y cierra un intento (nota 0-100 por aciertos ponderados; no influye la velocidad)
create or replace function public._finalize_attempt(p_attempt uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.attempts;
  v_w numeric; v_got numeric; v_n int; v_avg numeric; v_correct int; v_score int; v_grade numeric;
begin
  select * into a from public.attempts where id = p_attempt for update;
  if a.id is null or a.submitted_at is not null then return; end if;
  select coalesce(sum(case when q.base_points > 0 then q.base_points / 1000.0 else 0 end), 0),
         coalesce(sum(case when q.base_points > 0 then q.base_points / 1000.0 else 0 end * coalesce(an.partial_score, 0)), 0),
         count(*), coalesce(avg(coalesce(an.partial_score, 0)), 0),
         count(*) filter (where an.is_correct),
         coalesce(sum(an.game_points), 0)
    into v_w, v_got, v_n, v_avg, v_correct, v_score
    from unnest(a.question_ids) as qid
    join public.questions q on q.id = qid
    left join public.answers an on an.attempt_id = a.id and an.question_id = qid;
  v_grade := case when v_w > 0 then round(100 * v_got / v_w, 2) when v_n > 0 then round(100 * v_avg, 2) else 0 end;
  update public.attempts
     set submitted_at = now(), submit_reason = p_reason, grade = v_grade, correct_count = v_correct, score = v_score
   where id = a.id;
  -- El participante queda con su MEJOR intento (para ranking y reportes)
  update public.participants p
     set total_score = x.g, correct_count = x.c
    from (select round(grade)::int as g, correct_count as c from public.attempts
           where participant_id = a.participant_id and submitted_at is not null
           order by grade desc nulls last, submitted_at limit 1) x
   where p.id = a.participant_id;
end $$;

-- Entrega automáticamente los intentos cuyo tiempo ya venció (10 s de gracia para respuestas en camino)
create or replace function public._finalize_expired(p_session uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    select a.id, s.scheduled_end, a.deadline
      from public.attempts a
      join public.participants p on p.id = a.participant_id
      join public.sessions s on s.id = a.session_id
     where a.session_id = p_session and a.submitted_at is null
       and least(a.deadline, s.scheduled_end) + make_interval(secs => p.extra_time_sec) + interval '10 seconds' < now()
  loop
    perform public._finalize_attempt(r.id, case when r.deadline is not null and (r.scheduled_end is null or r.deadline <= r.scheduled_end) then 'time' else 'closed' end);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Nota de aprobación de la asignatura (por defecto 51)
create or replace function public._pass_mark(p_subject uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select pass_mark from public.grading_plans where subject_id = p_subject), 51);
$$;

-- ---------------------------------------------------------------------
-- DOCENTE: crear sesión (en vivo, examen o tarea)
-- p_settings: { mode, identification, require_ci, show_ranking, allow_late_join, grading_item_id,
--               opens_at, closes_at, time_limit_min, max_attempts, pick_count, shuffle_questions,
--               shuffle_options, show_correct, show_grade, focus_mode, lock_after }
-- ---------------------------------------------------------------------
create or replace function public.create_session(p_quiz uuid, p_subject uuid, p_settings jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_pin text;
  v_id uuid;
  v_item uuid := nullif(p_settings ->> 'grading_item_id', '')::uuid;
  v_mode text := coalesce(nullif(p_settings ->> 'mode', ''), 'live');
  v_open timestamptz := nullif(p_settings ->> 'opens_at', '')::timestamptz;
  v_close timestamptz := nullif(p_settings ->> 'closes_at', '')::timestamptz;
  v_limit int := round(nullif(p_settings ->> 'time_limit_min', '')::numeric * 60)::int;
  v_pick int := nullif(p_settings ->> 'pick_count', '')::int;
  v_ident text := coalesce(p_settings ->> 'identification', 'roster');
  i int := 0;
begin
  if not public.is_teacher() then raise exception 'Solo un docente aprobado puede lanzar sesiones'; end if;
  if not exists (select 1 from public.quizzes where id = p_quiz and teacher_id = v_uid) then
    raise exception 'La evaluación no existe o no es tuya';
  end if;
  if not exists (select 1 from public.subjects where id = p_subject and teacher_id = v_uid) then
    raise exception 'La asignatura no existe o no es tuya';
  end if;
  if v_item is not null and not exists (
    select 1 from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id
     where gi.id = v_item and gp.subject_id = p_subject and gi.teacher_id = v_uid) then
    raise exception 'La categoría del plan no corresponde a la asignatura';
  end if;
  if v_mode not in ('live', 'exam', 'homework') then raise exception 'Modo no válido'; end if;
  select array_agg(id order by sort_order) into v_ids from public.questions where quiz_id = p_quiz;
  if v_ids is null then raise exception 'La evaluación no tiene preguntas'; end if;

  if v_mode <> 'live' then
    if v_mode = 'exam' and v_ident <> 'roster' then raise exception 'El examen requiere la lista oficial (RU)'; end if;
    if v_close is not null and v_close <= coalesce(v_open, now()) then
      raise exception 'La hora de cierre debe ser posterior a la de apertura';
    end if;
    if v_limit is not null and (v_limit < 30 or v_limit > 6 * 3600) then
      raise exception 'El tiempo total debe estar entre 1 minuto y 6 horas';
    end if;
    if v_pick is not null and (v_pick < 1 or v_pick > array_length(v_ids, 1)) then
      raise exception 'Puedes elegir entre 1 y % preguntas al azar', array_length(v_ids, 1);
    end if;
  end if;

  loop
    i := i + 1;
    v_pin := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (select 1 from public.sessions where pin = v_pin and status <> 'finished');
    if i > 50 then raise exception 'No se pudo generar un PIN, intenta de nuevo'; end if;
  end loop;

  insert into public.sessions (teacher_id, quiz_id, subject_id, grading_item_id, pin, mode, status, phase,
                               question_ids, identification, require_ci, show_ranking, allow_late_join, settings,
                               scheduled_start, scheduled_end, time_limit_sec, max_attempts, pick_count,
                               shuffle_questions, shuffle_options, show_correct, show_grade, focus_mode, lock_after)
  values (v_uid, p_quiz, p_subject, v_item, v_pin, v_mode,
          case when v_mode = 'live' then 'lobby' else 'running' end, 'lobby', v_ids,
          v_ident,
          coalesce((p_settings ->> 'require_ci')::boolean, false),
          coalesce((p_settings ->> 'show_ranking')::boolean, v_mode = 'live'),
          coalesce((p_settings ->> 'allow_late_join')::boolean, true),
          p_settings,
          case when v_mode <> 'live' then v_open end,
          case when v_mode <> 'live' then v_close end,
          case when v_mode <> 'live' then v_limit end,
          greatest(1, least(20, coalesce((p_settings ->> 'max_attempts')::int, 1))),
          case when v_mode <> 'live' then v_pick end,
          coalesce((p_settings ->> 'shuffle_questions')::boolean, true),
          coalesce((p_settings ->> 'shuffle_options')::boolean, true),
          coalesce(nullif(p_settings ->> 'show_correct', ''), 'after_close'),
          coalesce((p_settings ->> 'show_grade')::boolean, true),
          coalesce((p_settings ->> 'focus_mode')::boolean, false),
          greatest(0, coalesce((p_settings ->> 'lock_after')::int, 0)))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'pin', v_pin, 'mode', v_mode);
end $$;

-- ---------------------------------------------------------------------
-- ESTUDIANTE: información del PIN (todos los modos)
-- ---------------------------------------------------------------------
create or replace function public.session_info(p_pin text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.sessions; v_title text; v_subject text; v_n int;
begin
  select * into s from public.sessions where pin = btrim(p_pin) order by (status <> 'finished') desc, created_at desc limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  if s.status = 'finished' then return jsonb_build_object('ok', false, 'error', 'finished'); end if;
  if s.mode = 'live' and s.status = 'scheduled' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if s.mode = 'live' and not s.allow_late_join and s.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'started'); end if;
  if s.mode <> 'live' and public._window(s) = 'closed' then return jsonb_build_object('ok', false, 'error', 'finished'); end if;
  select title into v_title from public.quizzes where id = s.quiz_id;
  select code || ' · ' || name into v_subject from public.subjects where id = s.subject_id;
  v_n := coalesce(s.pick_count, array_length(s.question_ids, 1));
  return jsonb_build_object('ok', true, 'mode', s.mode, 'identification', s.identification, 'require_ci', s.require_ci,
                            'quiz_title', v_title, 'subject', v_subject, 'phase', s.phase,
                            'window', public._window(s), 'opens_at', s.scheduled_start, 'closes_at', s.scheduled_end,
                            'time_limit_sec', s.time_limit_sec, 'question_count', v_n, 'max_attempts', s.max_attempts,
                            'focus_mode', s.focus_mode);
end $$;

-- ---------------------------------------------------------------------
-- ESTUDIANTE: estado del examen/tarea
-- ---------------------------------------------------------------------
create or replace function public.exam_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.participants;
  s public.sessions;
  a public.attempts;
  last public.attempts;
  v_used int;
  v_allowed int;
  v_window text;
  v_title text;
  v_subject text;
  v_review boolean;
  v_cur jsonb := null;
  v_rev jsonb := null;
  v_best numeric;
begin
  select * into p from public.participants where token = p_token;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.mode = 'live' then return jsonb_build_object('ok', false, 'error', 'mode'); end if;
  perform public._finalize_expired(s.id);
  update public.participants set last_ping = now(), connected = true where id = p.id;
  select * into p from public.participants where id = p.id;

  v_window := public._window(s);
  select count(*) into v_used from public.attempts where participant_id = p.id;
  v_allowed := s.max_attempts + p.extra_attempts;
  select * into a from public.attempts where participant_id = p.id and submitted_at is null;
  select * into last from public.attempts where participant_id = p.id and submitted_at is not null order by number desc limit 1;
  select max(grade) into v_best from public.attempts where participant_id = p.id and submitted_at is not null;
  select title into v_title from public.quizzes where id = s.quiz_id;
  select code || ' · ' || name into v_subject from public.subjects where id = s.subject_id;

  if a.id is not null then
    v_cur := jsonb_build_object(
      'id', a.id, 'number', a.number, 'started_at', a.started_at,
      'deadline', public._attempt_deadline(a.id), 'locked', a.locked, 'focus_losses', a.focus_losses,
      'questions', (select jsonb_agg(public._attempt_question(qid, a.id, s.shuffle_options) order by ord)
                      from unnest(a.question_ids) with ordinality as t(qid, ord)),
      'answers', coalesce((
        select jsonb_object_agg(an.question_id, case when s.show_correct = 'each' then
                 jsonb_build_object('response', an.response, 'correct', an.is_correct, 'partial', an.partial_score,
                                    'points', an.game_points) || jsonb_build_object('reveal', public._reveal_info(an.question_id))
               else jsonb_build_object('response', an.response) end)
          from public.answers an where an.attempt_id = a.id), '{}'::jsonb));
  end if;

  -- Revisión del último intento entregado (según la configuración del docente)
  v_review := last.id is not null and a.id is null and (
    s.show_correct in ('each', 'end') or (s.show_correct = 'after_close' and v_window = 'closed'));
  if v_review then
    v_rev := (select jsonb_agg(jsonb_build_object(
                 'question', public._attempt_question(qid, last.id, s.shuffle_options),
                 'response', an.response, 'correct', coalesce(an.is_correct, false), 'partial', coalesce(an.partial_score, 0),
                 'reveal', public._reveal_info(qid)) order by ord)
                from unnest(last.question_ids) with ordinality as t(qid, ord)
                left join public.answers an on an.attempt_id = last.id and an.question_id = qid);
  end if;

  return jsonb_build_object(
    'ok', true,
    'server_now', now(),
    'session', jsonb_build_object(
      'id', s.id, 'mode', s.mode, 'quiz_title', v_title, 'subject', v_subject, 'window', v_window,
      'opens_at', s.scheduled_start, 'closes_at', s.scheduled_end, 'time_limit_sec', s.time_limit_sec,
      'question_count', coalesce(s.pick_count, array_length(s.question_ids, 1)),
      'max_attempts', v_allowed, 'show_correct', s.show_correct, 'show_grade', s.show_grade,
      'focus_mode', s.focus_mode, 'lock_after', s.lock_after, 'pass_mark', public._pass_mark(s.subject_id)),
    'me', jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'extra_time_sec', p.extra_time_sec),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'number', x.number, 'started_at', x.started_at, 'submitted_at', x.submitted_at, 'reason', x.submit_reason,
               'grade', case when s.show_grade then x.grade end, 'correct', case when s.show_grade then x.correct_count end,
               'questions', array_length(x.question_ids, 1)) order by x.number)
        from public.attempts x where x.participant_id = p.id and x.submitted_at is not null), '[]'::jsonb),
    'best_grade', case when s.show_grade then v_best end,
    'can_start', a.id is null and v_window = 'open' and v_used < v_allowed,
    'attempts_left', greatest(0, v_allowed - v_used),
    'current', v_cur,
    'review', v_rev);
end $$;

create or replace function public.start_attempt(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.participants;
  s public.sessions;
  v_used int;
  v_ids uuid[];
  v_num int;
begin
  select * into p from public.participants where token = p_token for update;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.mode = 'live' then return jsonb_build_object('ok', false, 'error', 'mode'); end if;
  perform public._finalize_expired(s.id);
  if exists (select 1 from public.attempts where participant_id = p.id and submitted_at is null) then
    return public.exam_state(p_token);
  end if;
  if public._window(s) = 'not_open' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if public._window(s) = 'closed' then return jsonb_build_object('ok', false, 'error', 'finished'); end if;
  select count(*), coalesce(max(number), 0) + 1 into v_used, v_num from public.attempts where participant_id = p.id;
  if v_used >= s.max_attempts + p.extra_attempts then return jsonb_build_object('ok', false, 'error', 'no_attempts'); end if;

  -- Preguntas: al azar del banco (si se pidió) y en orden distinto por estudiante (si se pidió)
  select array_agg(x order by case when s.shuffle_questions then random() else array_position(s.question_ids, x) end)
    into v_ids
    from (select x from unnest(s.question_ids) as x
           order by case when s.pick_count is not null then random() else 0 end
           limit coalesce(s.pick_count, array_length(s.question_ids, 1))) t;

  insert into public.attempts (teacher_id, session_id, participant_id, number, question_ids, deadline)
  values (p.teacher_id, s.id, p.id, v_num, v_ids,
          case when s.time_limit_sec is not null then now() + make_interval(secs => s.time_limit_sec) end);
  return public.exam_state(p_token);
exception when unique_violation then
  return public.exam_state(p_token);
end $$;

create or replace function public.save_answer(p_token uuid, p_question uuid, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.participants;
  s public.sessions;
  a public.attempts;
  g jsonb;
  v_base int;
  v_partial numeric;
  v_deadline timestamptz;
  v_id uuid;
  v_ms int;
begin
  select * into p from public.participants where token = p_token;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  select * into s from public.sessions where id = p.session_id;
  select * into a from public.attempts where participant_id = p.id and submitted_at is null for update;
  if a.id is null then return jsonb_build_object('ok', false, 'error', 'no_attempt'); end if;
  if a.locked then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  v_deadline := public._attempt_deadline(a.id);
  -- 10 s de gracia para respuestas que estaban en camino (internet lento)
  if v_deadline is not null and now() > v_deadline + interval '10 seconds' then
    perform public._finalize_expired(s.id);
    return jsonb_build_object('ok', false, 'error', 'time');
  end if;
  if not (p_question = any (a.question_ids)) then return jsonb_build_object('ok', false, 'error', 'not_in_attempt'); end if;
  if pg_column_size(p_response) > 4000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;

  select base_points into v_base from public.questions where id = p_question;
  g := public._grade(p_question, p_response);
  v_partial := (g ->> 'partial')::numeric;
  v_ms := least(2000000000, greatest(0, (extract(epoch from (now() - a.started_at)) * 1000)))::int;

  if s.show_correct = 'each' then
    -- práctica con retroalimentación inmediata: la primera respuesta queda fija
    insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
    values (p.teacher_id, s.id, p.id, p_question, a.id, p_response, (g ->> 'correct')::boolean, v_partial, v_ms, round(v_base * v_partial))
    on conflict (attempt_id, question_id) where attempt_id is not null do nothing
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'already'); end if;
    return jsonb_build_object('ok', true, 'correct', (g ->> 'correct')::boolean, 'partial', v_partial,
                              'points', round(v_base * v_partial), 'reveal', public._reveal_info(p_question));
  end if;

  -- examen: se puede cambiar la respuesta hasta entregar
  insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
  values (p.teacher_id, s.id, p.id, p_question, a.id, p_response, (g ->> 'correct')::boolean, v_partial, v_ms, round(v_base * v_partial))
  on conflict (attempt_id, question_id) where attempt_id is not null do update
     set response = excluded.response, is_correct = excluded.is_correct, partial_score = excluded.partial_score,
         time_ms = excluded.time_ms, game_points = excluded.game_points, answered_at = now();
  update public.participants set last_ping = now(), connected = true where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.submit_attempt(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.participants; v_a uuid;
begin
  select * into p from public.participants where token = p_token;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  select id into v_a from public.attempts where participant_id = p.id and submitted_at is null;
  -- si el navegador entrega porque se acabó el tiempo, queda registrado como "se acabó el tiempo"
  if v_a is not null then
    perform public._finalize_attempt(v_a, case when now() >= public._attempt_deadline(v_a) - interval '2 seconds' then 'time' else 'student' end);
  end if;
  return public.exam_state(p_token);
end $$;

-- Eventos del navegador: cambio de pestaña/ventana o salida de pantalla completa ('tab') y pegar ('paste')
drop function if exists public.report_event(uuid, text);
create or replace function public.report_event(p_token uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.participants; s public.sessions; a public.attempts;
begin
  select * into p from public.participants where token = p_token and not kicked;
  if p.id is null then return jsonb_build_object('ok', false); end if;
  update public.participants
     set tab_switch_count = tab_switch_count + case when p_kind = 'tab' then 1 else 0 end,
         paste_count = paste_count + case when p_kind = 'paste' then 1 else 0 end
   where id = p.id;
  select * into s from public.sessions where id = p.session_id;
  update public.attempts
     set focus_losses = focus_losses + case when p_kind = 'tab' then 1 else 0 end,
         paste_count = paste_count + case when p_kind = 'paste' then 1 else 0 end,
         locked = locked or (s.lock_after > 0 and p_kind = 'tab' and focus_losses + 1 >= s.lock_after)
   where participant_id = p.id and submitted_at is null
  returning * into a;
  return jsonb_build_object('ok', true, 'locked', coalesce(a.locked, false), 'focus_losses', coalesce(a.focus_losses, p.tab_switch_count + 1));
end $$;

-- ---------------------------------------------------------------------
-- DOCENTE: monitor del examen/tarea
-- ---------------------------------------------------------------------
create or replace function public.exam_monitor(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sessions; v_title text; v_subject jsonb;
begin
  select * into s from public.sessions where id = p_session and teacher_id = auth.uid();
  if s.id is null then raise exception 'La sesión no existe o no es tuya'; end if;
  perform public._finalize_expired(s.id);
  select title into v_title from public.quizzes where id = s.quiz_id;
  select jsonb_build_object('id', id, 'code', code, 'parallel', parallel, 'name', name, 'theme_color', theme_color)
    into v_subject from public.subjects where id = s.subject_id;
  return jsonb_build_object(
    'server_now', now(),
    'session', jsonb_build_object(
      'id', s.id, 'pin', s.pin, 'mode', s.mode, 'status', s.status, 'window', public._window(s),
      'opens_at', s.scheduled_start, 'closes_at', s.scheduled_end, 'time_limit_sec', s.time_limit_sec,
      'max_attempts', s.max_attempts, 'pick_count', s.pick_count, 'total', array_length(s.question_ids, 1),
      'question_count', coalesce(s.pick_count, array_length(s.question_ids, 1)),
      'shuffle_questions', s.shuffle_questions, 'shuffle_options', s.shuffle_options, 'show_correct', s.show_correct,
      'show_grade', s.show_grade, 'focus_mode', s.focus_mode, 'lock_after', s.lock_after,
      'identification', s.identification, 'require_ci', s.require_ci, 'quiz_title', v_title, 'subject', v_subject,
      'created_at', s.created_at, 'pass_mark', public._pass_mark(s.subject_id)),
    'rows', coalesce((
      select jsonb_agg(r order by r.sort_name) from (
        select p.id as participant_id, p.student_id, p.nickname, p.avatar, p.kicked, p.extra_time_sec, p.extra_attempts,
               st.university_code as code,
               coalesce(st.last_names || ', ' || st.first_names, p.nickname) as name,
               lower(coalesce(st.last_names || ' ' || st.first_names, p.nickname)) as sort_name,
               p.last_ping > now() - interval '40 seconds' as connected,
               (select count(*) from public.attempts x where x.participant_id = p.id) as attempts_used,
               s.max_attempts + p.extra_attempts as attempts_allowed,
               (select max(grade) from public.attempts x where x.participant_id = p.id and x.submitted_at is not null) as best_grade,
               (select x.correct_count from public.attempts x where x.participant_id = p.id and x.submitted_at is not null
                 order by grade desc nulls last limit 1) as best_correct,
               (select max(submitted_at) from public.attempts x where x.participant_id = p.id) as last_submitted_at,
               (select x.submit_reason from public.attempts x where x.participant_id = p.id and x.submitted_at is not null
                 order by number desc limit 1) as last_reason,
               (select coalesce(sum(focus_losses), 0) from public.attempts x where x.participant_id = p.id) as focus_total,
               (select coalesce(sum(paste_count), 0) from public.attempts x where x.participant_id = p.id) as paste_total,
               (select jsonb_build_object('number', x.number, 'started_at', x.started_at, 'deadline', public._attempt_deadline(x.id),
                                          'answered', (select count(*) from public.answers an where an.attempt_id = x.id),
                                          'total', array_length(x.question_ids, 1), 'locked', x.locked, 'focus_losses', x.focus_losses)
                  from public.attempts x where x.participant_id = p.id and x.submitted_at is null) as current
          from public.participants p
          left join public.students st on st.id = p.student_id
         where p.session_id = s.id
        union all
        select null, st.id, null, null, false, 0, 0, st.university_code, st.last_names || ', ' || st.first_names,
               lower(st.last_names || ' ' || st.first_names), false, 0, s.max_attempts, null, null, null, null, 0, 0, null
          from public.enrollments e join public.students st on st.id = e.student_id
         where s.identification = 'roster' and e.subject_id = s.subject_id and e.active and st.active
           and not exists (select 1 from public.participants p where p.session_id = s.id and p.student_id = st.id)
      ) r), '[]'::jsonb));
end $$;

-- open_now | close_now | extend (minutos a todos) | reopen (minutos)
create or replace function public.exam_control(p_session uuid, p_action text, p_minutes int default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sessions := public._own_session(p_session); r record; v_min int := greatest(1, least(coalesce(p_minutes, 0), 60 * 24 * 30));
begin
  if s.mode = 'live' then raise exception 'Solo para examen o tarea'; end if;
  if p_action = 'open_now' then
    update public.sessions set scheduled_start = now(), status = 'running', finished_at = null,
           scheduled_end = case when scheduled_end is not null and scheduled_end <= now() then null else scheduled_end end
     where id = s.id;
  elsif p_action = 'close_now' then
    update public.sessions set scheduled_end = now(), status = 'finished', finished_at = now() where id = s.id;
    for r in select id from public.attempts where session_id = s.id and submitted_at is null loop
      perform public._finalize_attempt(r.id, 'closed');
    end loop;
  elsif p_action = 'extend' then
    update public.sessions set scheduled_end = case when scheduled_end is not null then greatest(scheduled_end, now()) + make_interval(mins => v_min) end
     where id = s.id;
    update public.attempts set deadline = deadline + make_interval(mins => v_min)
     where session_id = s.id and submitted_at is null and deadline is not null;
  elsif p_action = 'reopen' then
    update public.sessions set status = 'running', finished_at = null, scheduled_end = now() + make_interval(mins => v_min) where id = s.id;
  else
    raise exception 'Acción desconocida';
  end if;
  return public.exam_monitor(p_session);
end $$;

-- extra_time (minutos) | unlock | grant_attempt | force_submit
create or replace function public.exam_participant(p_participant uuid, p_action text, p_minutes int default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare v_a uuid;
begin
  if not exists (select 1 from public.participants where id = p_participant and teacher_id = auth.uid()) then
    raise exception 'El participante no existe o no es tuyo';
  end if;
  select id into v_a from public.attempts where participant_id = p_participant and submitted_at is null;
  if p_action = 'extra_time' then
    update public.participants set extra_time_sec = greatest(0, extra_time_sec + least(greatest(coalesce(p_minutes, 0), -600), 600) * 60)
     where id = p_participant;
  elsif p_action = 'unlock' then
    update public.attempts set locked = false where id = v_a;
  elsif p_action = 'grant_attempt' then
    update public.participants set extra_attempts = extra_attempts + 1 where id = p_participant;
  elsif p_action = 'force_submit' then
    if v_a is not null then perform public._finalize_attempt(v_a, 'teacher'); end if;
  else
    raise exception 'Acción desconocida';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Funciones del modo en vivo actualizadas
-- ---------------------------------------------------------------------
create or replace function public.join_session(
  p_pin text, p_code text default null, p_ci text default null, p_nickname text default null,
  p_avatar jsonb default '{}'::jsonb, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  st public.students;
  p public.participants;
  v_nick text;
  v_dup int;
begin
  select * into s from public.sessions where pin = btrim(p_pin) and status <> 'finished' order by created_at desc limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  if s.mode = 'live' and s.status = 'scheduled' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;

  if s.identification = 'roster' then
    select st0.* into st from public.students st0
      join public.enrollments e on e.student_id = st0.id and e.subject_id = s.subject_id and e.active
     where st0.teacher_id = s.teacher_id and st0.university_code = public.normalize_code(p_code) and st0.active;
    if st.id is null then return jsonb_build_object('ok', false, 'error', 'not_enrolled'); end if;
    if s.require_ci and (
         length(regexp_replace(coalesce(st.ci, ''), '\D', '', 'g')) < 3
         or right(regexp_replace(coalesce(st.ci, ''), '\D', '', 'g'), 3) <> right(regexp_replace(coalesce(p_ci, ''), '\D', '', 'g'), 3)) then
      return jsonb_build_object('ok', false, 'error', 'ci');
    end if;
    select * into p from public.participants where session_id = s.id and student_id = st.id for update;
    if p.id is not null then
      if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
      -- En examen y en vivo el RU queda atado a un dispositivo; en tarea (en casa) se puede cambiar de equipo
      if p.device_id is not null and p_device is not null and p.device_id <> p_device and s.mode <> 'homework' then
        update public.participants set takeover_pending = true where id = p.id;
        return jsonb_build_object('ok', false, 'error', 'other_device');
      end if;
      update public.participants
         set device_id = coalesce(p_device, device_id), connected = true, last_ping = now(), takeover_pending = false,
             avatar = case when p_avatar is not null and p_avatar <> '{}'::jsonb then p_avatar else avatar end
       where id = p.id returning * into p;
      return jsonb_build_object('ok', true, 'token', p.token, 'nickname', p.nickname, 'rejoined', true);
    end if;
    if not s.allow_late_join and s.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'started'); end if;
    if s.mode <> 'live' and public._window(s) = 'closed' then return jsonb_build_object('ok', false, 'error', 'finished'); end if;
    -- Nombre visible: primer nombre + inicial del apellido (con RU si se repite)
    v_nick := split_part(st.first_names, ' ', 1) || ' ' || left(st.last_names, 1) || '.';
    select count(*) into v_dup from public.participants where session_id = s.id and nickname = v_nick;
    if v_dup > 0 then v_nick := v_nick || ' (' || right(st.university_code, 4) || ')'; end if;
    insert into public.participants (teacher_id, session_id, student_id, nickname, avatar, device_id)
    values (s.teacher_id, s.id, st.id, v_nick, coalesce(p_avatar, '{}'::jsonb), p_device)
    returning * into p;
  else
    v_nick := regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g');
    if length(v_nick) < 2 or length(v_nick) > 20 then return jsonb_build_object('ok', false, 'error', 'nickname_length'); end if;
    if public._bad_nickname(v_nick) then return jsonb_build_object('ok', false, 'error', 'nickname_bad'); end if;
    select * into p from public.participants where session_id = s.id and student_id is null and lower(nickname) = lower(v_nick);
    if p.id is not null then
      if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
      if p_device is not null and p.device_id = p_device then
        update public.participants set connected = true, last_ping = now() where id = p.id;
        return jsonb_build_object('ok', true, 'token', p.token, 'nickname', p.nickname, 'rejoined', true);
      end if;
      return jsonb_build_object('ok', false, 'error', 'nickname_taken');
    end if;
    if not s.allow_late_join and s.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'started'); end if;
    if s.mode <> 'live' and public._window(s) = 'closed' then return jsonb_build_object('ok', false, 'error', 'finished'); end if;
    insert into public.participants (teacher_id, session_id, nickname, avatar, device_id)
    values (s.teacher_id, s.id, v_nick, coalesce(p_avatar, '{}'::jsonb), p_device)
    returning * into p;
  end if;
  return jsonb_build_object('ok', true, 'token', p.token, 'nickname', p.nickname, 'rejoined', false);
end $$;


create or replace function public.submit_answer(p_token uuid, p_question uuid, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.participants;
  s public.sessions;
  v_q uuid;
  v_base int;
  g jsonb;
  v_partial numeric;
  v_correct boolean;
  v_ms int;
  v_limit_ms numeric;
  v_points int := 0;
  v_streak int;
  v_bonus int := 0;
  v_id uuid;
begin
  select * into p from public.participants where token = p_token;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.phase <> 'question' or s.paused_at is not null then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  v_q := s.question_ids[s.current_question + 1];
  if v_q is distinct from p_question then return jsonb_build_object('ok', false, 'error', 'not_current'); end if;
  -- tolerancia de 500 ms por latencia de red
  if now() > s.question_ends_at + interval '500 milliseconds' then return jsonb_build_object('ok', false, 'error', 'late'); end if;
  if pg_column_size(p_response) > 4000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;

  select base_points into v_base from public.questions where id = v_q;
  g := public._grade(v_q, p_response);
  v_partial := (g ->> 'partial')::numeric;
  v_correct := (g ->> 'correct')::boolean;
  v_ms := greatest(0, (extract(epoch from (now() - s.question_started_at)) * 1000)::int);
  v_limit_ms := greatest(1, extract(epoch from (s.question_ends_at - s.question_started_at)) * 1000);
  if v_partial > 0 and v_base > 0 then
    v_points := round(v_base * (1 - least(1, v_ms / v_limit_ms) / 2) * v_partial);
  end if;
  v_streak := case when v_correct then p.streak + 1 else 0 end;
  if v_correct and v_base > 0 then v_bonus := least(500, greatest(0, (v_streak - 1) * 100)); end if;

  insert into public.answers (teacher_id, session_id, participant_id, question_id, response, is_correct, partial_score, time_ms, game_points)
  values (p.teacher_id, s.id, p.id, v_q, p_response, v_correct, v_partial, least(v_ms, v_limit_ms::int), v_points + v_bonus)
  on conflict (participant_id, question_id) where attempt_id is null do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'already'); end if;

  update public.participants
     set total_score = total_score + v_points + v_bonus,
         streak = v_streak,
         max_streak = greatest(max_streak, v_streak),
         correct_count = correct_count + case when v_correct then 1 else 0 end,
         last_ping = now(), connected = true
   where id = p.id;
  -- No se revela si acertó: solo se confirma la recepción
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public._window(public.sessions)', 'public._attempt_deadline(uuid)', 'public._attempt_question(uuid, uuid, boolean)',
                           'public._finalize_attempt(uuid, text)', 'public._finalize_expired(uuid)', 'public._pass_mark(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.create_session(uuid, uuid, jsonb)', 'public.exam_monitor(uuid)',
                           'public.exam_control(uuid, text, integer)', 'public.exam_participant(uuid, text, integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.session_info(text)', 'public.join_session(text, text, text, text, jsonb, text)',
                           'public.submit_answer(uuid, uuid, jsonb)', 'public.report_event(uuid, text)',
                           'public.exam_state(uuid)', 'public.start_attempt(uuid)', 'public.save_answer(uuid, uuid, jsonb)',
                           'public.submit_attempt(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
