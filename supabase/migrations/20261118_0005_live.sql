-- =====================================================================
-- YaguarQuiz UAP — Fase 4: juego en vivo
-- Principios de seguridad:
--   * El estudiante (rol anon) NO lee tablas: solo llama funciones que validan su token.
--   * La respuesta correcta nunca se envía antes de cerrar la pregunta (fase "reveal").
--   * La corrección, el tiempo y los puntos se calculan en el servidor con now().
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.sessions add column if not exists phase text not null default 'lobby';
alter table public.sessions add column if not exists phase_started_at timestamptz not null default now();
alter table public.sessions add column if not exists question_ends_at timestamptz;
alter table public.sessions add column if not exists paused_at timestamptz;
alter table public.sessions add column if not exists question_ids uuid[] not null default '{}';
alter table public.sessions add column if not exists identification text not null default 'roster';
alter table public.sessions add column if not exists require_ci boolean not null default false;
alter table public.sessions add column if not exists show_ranking boolean not null default true;
alter table public.sessions add column if not exists allow_late_join boolean not null default true;

do $$ begin
  alter table public.sessions add constraint sessions_phase_chk
    check (phase in ('lobby', 'countdown', 'question', 'reveal', 'leaderboard', 'finished'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sessions add constraint sessions_ident_chk check (identification in ('roster', 'nickname'));
exception when duplicate_object then null; end $$;

alter table public.participants add column if not exists device_id text;
alter table public.participants add column if not exists takeover_pending boolean not null default false;
alter table public.participants add column if not exists kicked boolean not null default false;
alter table public.participants add column if not exists correct_count int not null default 0;
alter table public.participants add column if not exists max_streak int not null default 0;

create unique index if not exists participants_nickname_uq
  on public.participants (session_id, lower(nickname)) where student_id is null;
create index if not exists idx_answers_question on public.answers (question_id);
create index if not exists idx_sessions_pin on public.sessions (pin) where status <> 'finished';

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.normalize_answer(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(
    translate(lower(coalesce(t, '')), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'),
    '[_\-.:]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Corrige una respuesta. Devuelve {"correct": bool, "partial": 0..1}
create or replace function public._grade(p_question uuid, p_response jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_type text;
  v_acc text[];
  v_kind text := p_response ->> 'kind';
  v_ncorrect int;
  v_hits int;
  v_wrong int;
  v_total int;
  v_inplace int;
  v_partial numeric := 0;
begin
  select q.type, q.accepted_answers into v_type, v_acc from public.questions q where q.id = p_question;
  if v_type in ('single', 'true_false', 'image_choice') then
    if v_kind = 'choice' and exists (
      select 1 from public.question_options o
       where o.question_id = p_question and o.id::text = p_response ->> 'key' and o.is_correct) then
      v_partial := 1;
    end if;
  elsif v_type = 'multiple' then
    if v_kind = 'choices' and jsonb_typeof(p_response -> 'keys') = 'array' then
      select count(*) into v_ncorrect from public.question_options o where o.question_id = p_question and o.is_correct;
      select count(*) filter (where o.is_correct), count(*) filter (where not o.is_correct)
        into v_hits, v_wrong
        from (select distinct jsonb_array_elements_text(p_response -> 'keys') as k) r
        join public.question_options o on o.id::text = r.k and o.question_id = p_question;
      if v_ncorrect > 0 then
        v_partial := greatest(0, (v_hits - v_wrong)::numeric / v_ncorrect);
      end if;
    end if;
  elsif v_type = 'short_text' then
    if v_kind = 'text' and public.normalize_answer(p_response ->> 'text') <> '' and exists (
      select 1 from unnest(v_acc) a where public.normalize_answer(a) = public.normalize_answer(p_response ->> 'text')) then
      v_partial := 1;
    end if;
  elsif v_type = 'ordering' then
    if v_kind = 'order' and jsonb_typeof(p_response -> 'keys') = 'array' then
      select count(*) into v_total from public.question_options o where o.question_id = p_question;
      select count(*) into v_inplace
        from jsonb_array_elements_text(p_response -> 'keys') with ordinality as r(k, ord)
        join public.question_options o on o.id::text = r.k and o.question_id = p_question and o.correct_position = r.ord;
      if v_total > 0 then v_partial := v_inplace::numeric / v_total; end if;
    end if;
  end if;
  return jsonb_build_object('correct', v_partial = 1, 'partial', round(v_partial, 4));
end $$;

-- Orden en que se muestran las opciones. En "ordenar" se mezclan de forma fija (todos ven lo mismo
-- que el proyector) y nunca se muestran ya en el orden correcto.
create or replace function public._display_order(p_question uuid)
returns uuid[] language plpgsql stable security definer set search_path = '' as $$
declare v_type text; v_ord uuid[]; v_ok uuid[];
begin
  select type into v_type from public.questions where id = p_question;
  if v_type <> 'ordering' then
    select array_agg(id order by sort_order) into v_ord from public.question_options where question_id = p_question;
    return coalesce(v_ord, '{}');
  end if;
  select array_agg(id order by md5(id::text)) into v_ord from public.question_options where question_id = p_question;
  select array_agg(id order by correct_position) into v_ok from public.question_options where question_id = p_question;
  if v_ord = v_ok and array_length(v_ord, 1) > 1 then
    select array_agg(x order by i desc) into v_ord from unnest(v_ord) with ordinality as t(x, i);
  end if;
  return coalesce(v_ord, '{}');
end $$;

-- Pregunta tal como la ve el estudiante (SIN la respuesta correcta).
create or replace function public._student_question(p_question uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id, 'type', q.type, 'prompt', q.prompt, 'image_url', q.image_url,
    'time_limit_sec', q.time_limit_sec, 'base_points', q.base_points,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('key', o.id, 'text', o.text, 'image_url', o.image_url)
             order by array_position(public._display_order(q.id), o.id))
        from public.question_options o where o.question_id = q.id), '[]'::jsonb))
  from public.questions q where q.id = p_question;
$$;

-- Información de la revelación (solo se usa cuando la pregunta ya cerró)
create or replace function public._reveal_info(p_question uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'correct_keys', coalesce((select jsonb_agg(o.id) from public.question_options o where o.question_id = q.id and o.is_correct and q.type <> 'ordering'), '[]'::jsonb),
    'correct_order', case when q.type = 'ordering' then
        (select jsonb_agg(o.id order by o.correct_position) from public.question_options o where o.question_id = q.id) end,
    'accepted_answers', to_jsonb(q.accepted_answers),
    'explanation', q.explanation)
  from public.questions q where q.id = p_question;
$$;

-- Ranking de una sesión
create or replace function public._leaderboard(p_session uuid, p_limit int default 5)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.rank, x.nickname), '[]'::jsonb) from (
    select p.id, p.nickname, p.avatar, p.total_score as score, p.streak, p.correct_count,
           rank() over (order by p.total_score desc) as rank
      from public.participants p
     where p.session_id = p_session and not p.kicked
     order by p.total_score desc, p.joined_at
     limit p_limit) x;
$$;

-- Nota académica (0-100) de un participante: aciertos ponderados por el peso de cada pregunta
-- (Estándar = 1, Doble = 2, Sin puntos = no cuenta). La velocidad NO influye en la nota.
create or replace function public._participant_grade(p_participant uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  with s as (
    select se.question_ids from public.participants p join public.sessions se on se.id = p.session_id where p.id = p_participant
  ), w as (
    select q.id, q.base_points / 1000.0 as weight
      from s, unnest(s.question_ids) as qid join public.questions q on q.id = qid
  )
  select case when sum(w.weight) > 0 then
    round(100 * sum(w.weight * coalesce(a.partial_score, 0)) / sum(w.weight), 2) end
  from w left join public.answers a on a.question_id = w.id and a.participant_id = p_participant;
$$;

-- Filtro sencillo de apodos inapropiados (modo libre)
create or replace function public._bad_nickname(t text)
returns boolean language sql immutable as $$
  select public.normalize_answer(t) ~ '(put[ao]|mierd|cabron|pendej|verga|pinche|culo|coño|cono|marica|maric|idiot|estupid|imbecil|forro|cojud|jodid|chuch|carajo|joder|sexo|porno|nazi|hitler|fuck|shit|bitch)';
$$;

-- ---------------------------------------------------------------------
-- DOCENTE: crear sesión
-- p_settings: { identification: 'roster'|'nickname', require_ci, show_ranking, allow_late_join, grading_item_id }
-- ---------------------------------------------------------------------
create or replace function public.create_session(p_quiz uuid, p_subject uuid, p_settings jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_pin text;
  v_id uuid;
  v_item uuid := nullif(p_settings ->> 'grading_item_id', '')::uuid;
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
  select array_agg(id order by sort_order) into v_ids from public.questions where quiz_id = p_quiz;
  if v_ids is null then raise exception 'La evaluación no tiene preguntas'; end if;

  loop
    i := i + 1;
    v_pin := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (select 1 from public.sessions where pin = v_pin and status <> 'finished');
    if i > 50 then raise exception 'No se pudo generar un PIN, intenta de nuevo'; end if;
  end loop;

  insert into public.sessions (teacher_id, quiz_id, subject_id, grading_item_id, pin, mode, status, phase,
                               question_ids, identification, require_ci, show_ranking, allow_late_join, settings)
  values (v_uid, p_quiz, p_subject, v_item, v_pin, 'live', 'lobby', 'lobby', v_ids,
          coalesce(p_settings ->> 'identification', 'roster'),
          coalesce((p_settings ->> 'require_ci')::boolean, false),
          coalesce((p_settings ->> 'show_ranking')::boolean, true),
          coalesce((p_settings ->> 'allow_late_join')::boolean, true),
          p_settings)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'pin', v_pin);
end $$;

-- Verifica que la sesión sea del docente actual y la bloquea para actualizarla
create or replace function public._own_session(p_session uuid)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session and teacher_id = auth.uid() for update;
  if s.id is null then raise exception 'La sesión no existe o no es tuya'; end if;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- DOCENTE: avanzar de fase
-- lobby → countdown → question → reveal → leaderboard → countdown … → finished
-- ---------------------------------------------------------------------
-- p_from: fase que el proyector cree que está activa. Si ya cambió (doble clic, dos pestañas abiertas)
-- no se hace nada, así nunca se salta una pregunta por accidente.
drop function if exists public.host_advance(uuid);
create or replace function public.host_advance(p_session uuid, p_from text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions := public._own_session(p_session);
  v_total int := coalesce(array_length(s.question_ids, 1), 0);
  v_q uuid;
  v_limit int;
begin
  if p_from is not null and s.phase <> p_from then return public.host_state(p_session); end if;
  if s.phase = 'finished' then return public.host_state(p_session); end if;
  if s.paused_at is not null then raise exception 'La sesión está en pausa'; end if;
  if s.phase = 'lobby' or s.phase = 'leaderboard' or (s.phase = 'reveal' and not s.show_ranking) then
    if s.phase <> 'lobby' and s.current_question + 1 >= v_total then
      update public.sessions set phase = 'finished', status = 'finished', finished_at = now(), phase_started_at = now() where id = s.id;
    else
      update public.sessions
         set phase = 'countdown', status = 'running', phase_started_at = now(),
             current_question = case when s.phase = 'lobby' then 0 else s.current_question + 1 end,
             question_started_at = null, question_ends_at = null
       where id = s.id;
    end if;
  elsif s.phase = 'countdown' then
    v_q := s.question_ids[s.current_question + 1];
    select time_limit_sec into v_limit from public.questions where id = v_q;
    update public.sessions
       set phase = 'question', phase_started_at = now(), question_started_at = now(),
           question_ends_at = now() + make_interval(secs => coalesce(v_limit, 20))
     where id = s.id;
  elsif s.phase = 'question' then
    v_q := s.question_ids[s.current_question + 1];
    update public.sessions set phase = 'reveal', phase_started_at = now(), question_ends_at = least(question_ends_at, now()) where id = s.id;
    -- quien no respondió pierde la racha
    update public.participants p set streak = 0
     where p.session_id = s.id and not p.kicked
       and not exists (select 1 from public.answers a where a.participant_id = p.id and a.question_id = v_q);
  elsif s.phase = 'reveal' then
    update public.sessions set phase = 'leaderboard', phase_started_at = now() where id = s.id;
  end if;
  return public.host_state(p_session);
end $$;

create or replace function public.host_pause(p_session uuid, p_pause boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sessions := public._own_session(p_session);
begin
  if p_pause and s.paused_at is null then
    update public.sessions set paused_at = now() where id = s.id;
  elsif not p_pause and s.paused_at is not null then
    -- se corre el reloj lo que duró la pausa
    update public.sessions
       set question_started_at = question_started_at + (now() - s.paused_at),
           question_ends_at = question_ends_at + (now() - s.paused_at),
           phase_started_at = phase_started_at + (now() - s.paused_at),
           paused_at = null
     where id = s.id;
  end if;
  return public.host_state(p_session);
end $$;

create or replace function public.host_add_time(p_session uuid, p_seconds int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sessions := public._own_session(p_session);
begin
  if s.phase = 'question' then
    update public.sessions set question_ends_at = greatest(question_ends_at, now()) + make_interval(secs => least(greatest(p_seconds, 1), 120))
     where id = s.id;
  end if;
  return public.host_state(p_session);
end $$;

create or replace function public.host_end(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sessions := public._own_session(p_session);
begin
  update public.sessions set phase = 'finished', status = 'finished', finished_at = now(), phase_started_at = now(), paused_at = null where id = s.id;
  return public.host_state(p_session);
end $$;

create or replace function public.host_participant(p_participant uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.participants where id = p_participant and teacher_id = auth.uid()) then
    raise exception 'El participante no existe o no es tuyo';
  end if;
  if p_action = 'kick' then
    update public.participants set kicked = true, connected = false where id = p_participant;
  elsif p_action = 'unkick' then
    update public.participants set kicked = false where id = p_participant;
  elsif p_action = 'authorize_device' then
    update public.participants set device_id = null, takeover_pending = false where id = p_participant;
  else
    raise exception 'Acción desconocida';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- DOCENTE: estado completo para el proyector (incluye la respuesta correcta)
-- ---------------------------------------------------------------------
create or replace function public.host_state(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.sessions;
  v_q uuid;
  v_quiz text;
  v_subject jsonb;
  v_question jsonb;
  v_dist jsonb;
  v_answered int := 0;
begin
  select * into s from public.sessions where id = p_session and teacher_id = auth.uid();
  if s.id is null then raise exception 'La sesión no existe o no es tuya'; end if;
  select title into v_quiz from public.quizzes where id = s.quiz_id;
  select jsonb_build_object('id', id, 'code', code, 'parallel', parallel, 'name', name, 'theme_color', theme_color)
    into v_subject from public.subjects where id = s.subject_id;

  if s.current_question is not null and s.phase in ('countdown', 'question', 'reveal', 'leaderboard') then
    v_q := s.question_ids[s.current_question + 1];
    select jsonb_build_object(
      'id', q.id, 'type', q.type, 'prompt', q.prompt, 'image_url', q.image_url, 'time_limit_sec', q.time_limit_sec,
      'base_points', q.base_points, 'explanation', q.explanation, 'accepted_answers', to_jsonb(q.accepted_answers),
      'options', coalesce((select jsonb_agg(jsonb_build_object('key', o.id, 'text', o.text, 'image_url', o.image_url,
                                                               'is_correct', o.is_correct, 'correct_position', o.correct_position)
                                            order by array_position(public._display_order(q.id), o.id))
                             from public.question_options o where o.question_id = q.id), '[]'::jsonb))
      into v_question from public.questions q where q.id = v_q;
    select count(*) into v_answered from public.answers a
      join public.participants p on p.id = a.participant_id
     where a.question_id = v_q and a.session_id = s.id and not p.kicked;
    -- Distribución de respuestas (para el gráfico de barras)
    select jsonb_build_object(
      'by_option', coalesce((
        select jsonb_object_agg(o.id, (
          select count(*) from public.answers a
           where a.session_id = s.id and a.question_id = v_q
             and (a.response ->> 'key' = o.id::text or coalesce(a.response -> 'keys', '[]'::jsonb) ? o.id::text)))
          from public.question_options o where o.question_id = v_q), '{}'::jsonb),
      'correct', (select count(*) from public.answers a where a.session_id = s.id and a.question_id = v_q and a.is_correct),
      'partial', (select count(*) from public.answers a where a.session_id = s.id and a.question_id = v_q and not a.is_correct and a.partial_score > 0),
      'wrong', (select count(*) from public.answers a where a.session_id = s.id and a.question_id = v_q and a.partial_score = 0))
      into v_dist;
  end if;

  return jsonb_build_object(
    'server_now', now(),
    'session', jsonb_build_object(
      'id', s.id, 'pin', s.pin, 'status', s.status, 'phase', s.phase, 'mode', s.mode,
      'question_index', s.current_question, 'total', coalesce(array_length(s.question_ids, 1), 0),
      'phase_started_at', s.phase_started_at, 'question_started_at', s.question_started_at,
      'question_ends_at', s.question_ends_at, 'paused_at', s.paused_at,
      'identification', s.identification, 'require_ci', s.require_ci, 'show_ranking', s.show_ranking,
      'allow_late_join', s.allow_late_join, 'quiz_title', v_quiz, 'subject', v_subject, 'created_at', s.created_at),
    'question', v_question,
    'answered', v_answered,
    'distribution', v_dist,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'score', p.total_score, 'streak', p.streak,
        'correct_count', p.correct_count, 'connected', p.last_ping > now() - interval '12 seconds',
        'kicked', p.kicked, 'takeover_pending', p.takeover_pending, 'tab_switch_count', p.tab_switch_count,
        'student_id', p.student_id, 'paste_count', p.paste_count, 'max_streak', p.max_streak,
        'code', st.university_code, 'full_name', case when st.id is not null then st.last_names || ', ' || st.first_names end,
        'grade', case when s.phase = 'finished' then public._participant_grade(p.id) end,
        'answered', v_q is not null and exists (select 1 from public.answers a where a.participant_id = p.id and a.question_id = v_q))
        order by p.joined_at)
      from public.participants p left join public.students st on st.id = p.student_id
     where p.session_id = s.id), '[]'::jsonb),
    'absent', case when s.identification = 'roster' then coalesce((
      select jsonb_agg(st.last_names || ', ' || st.first_names order by st.last_names)
        from public.enrollments e join public.students st on st.id = e.student_id
       where e.subject_id = s.subject_id and e.active and st.active
         and not exists (select 1 from public.participants p where p.session_id = s.id and p.student_id = st.id)), '[]'::jsonb)
      else '[]'::jsonb end,
    'leaderboard', public._leaderboard(s.id, 10));
end $$;

-- ---------------------------------------------------------------------
-- ESTUDIANTE (anon): entrar a la sesión
-- ---------------------------------------------------------------------
create or replace function public.session_info(p_pin text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.sessions; v_title text; v_subject text;
begin
  select * into s from public.sessions where pin = btrim(p_pin) order by (status <> 'finished') desc, created_at desc limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  if s.status = 'finished' then return jsonb_build_object('ok', false, 'error', 'finished'); end if;
  if s.status = 'scheduled' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if not s.allow_late_join and s.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'started'); end if;
  select title into v_title from public.quizzes where id = s.quiz_id;
  select code || ' · ' || name into v_subject from public.subjects where id = s.subject_id;
  return jsonb_build_object('ok', true, 'identification', s.identification, 'require_ci', s.require_ci,
                            'quiz_title', v_title, 'subject', v_subject, 'phase', s.phase);
end $$;

-- Busca al estudiante por RU para confirmar "¿Eres …?" (solo inscritos en la asignatura de la sesión)
create or replace function public.lookup_student(p_pin text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.sessions; st public.students;
begin
  select * into s from public.sessions where pin = btrim(p_pin) and status <> 'finished' order by created_at desc limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  if s.identification <> 'roster' then return jsonb_build_object('ok', false, 'error', 'mode'); end if;
  select st0.* into st from public.students st0
    join public.enrollments e on e.student_id = st0.id and e.subject_id = s.subject_id and e.active
   where st0.teacher_id = s.teacher_id and st0.university_code = public.normalize_code(p_code) and st0.active;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'not_enrolled'); end if;
  return jsonb_build_object('ok', true, 'name', st.last_names || ', ' || st.first_names, 'require_ci', s.require_ci);
end $$;

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
  if s.status = 'scheduled' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;

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
      if p.device_id is not null and p_device is not null and p.device_id <> p_device then
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
    insert into public.participants (teacher_id, session_id, nickname, avatar, device_id)
    values (s.teacher_id, s.id, v_nick, coalesce(p_avatar, '{}'::jsonb), p_device)
    returning * into p;
  end if;
  return jsonb_build_object('ok', true, 'token', p.token, 'nickname', p.nickname, 'rejoined', false);
end $$;

-- ---------------------------------------------------------------------
-- ESTUDIANTE: estado actual (se consulta cada ~2 s y al recibir un aviso)
-- ---------------------------------------------------------------------
create or replace function public.get_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.participants;
  s public.sessions;
  v_q uuid;
  v_ans public.answers;
  v_rank int;
  v_total int;
  v_out jsonb;
  v_title text;
begin
  select * into p from public.participants where token = p_token;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  select * into s from public.sessions where id = p.session_id;
  if p.last_ping < now() - interval '3 seconds' then
    update public.participants set last_ping = now(), connected = true where id = p.id;
  end if;
  select count(*) + 1 into v_rank from public.participants x where x.session_id = s.id and not x.kicked and x.total_score > p.total_score;
  select count(*) into v_total from public.participants x where x.session_id = s.id and not x.kicked;
  select title into v_title from public.quizzes where id = s.quiz_id;

  v_out := jsonb_build_object(
    'ok', true,
    'server_now', now(),
    'session', jsonb_build_object(
      'id', s.id, 'phase', s.phase, 'status', s.status, 'question_index', s.current_question,
      'total', coalesce(array_length(s.question_ids, 1), 0), 'phase_started_at', s.phase_started_at,
      'question_started_at', s.question_started_at, 'question_ends_at', s.question_ends_at,
      'paused', s.paused_at is not null, 'show_ranking', s.show_ranking, 'quiz_title', v_title),
    'me', jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'score', p.total_score,
                             'streak', p.streak, 'rank', v_rank, 'of', v_total, 'correct_count', p.correct_count));

  if s.current_question is not null and s.phase in ('question', 'reveal', 'leaderboard') then
    v_q := s.question_ids[s.current_question + 1];
    select * into v_ans from public.answers where participant_id = p.id and question_id = v_q;
    v_out := v_out || jsonb_build_object('question', public._student_question(v_q),
      'my_answer', case when v_ans.id is null then jsonb_build_object('answered', false)
                        when s.phase = 'question' then jsonb_build_object('answered', true, 'response', v_ans.response)
                        else jsonb_build_object('answered', true, 'response', v_ans.response, 'correct', v_ans.is_correct,
                                                'partial', v_ans.partial_score, 'points', v_ans.game_points) end);
    if s.phase in ('reveal', 'leaderboard') then
      v_out := v_out || jsonb_build_object('reveal', public._reveal_info(v_q));
    end if;
  end if;
  if s.phase in ('leaderboard', 'finished') and s.show_ranking then
    v_out := v_out || jsonb_build_object('leaderboard', public._leaderboard(s.id, 5));
  end if;
  if s.phase = 'finished' then
    v_out := v_out || jsonb_build_object('summary', jsonb_build_object(
      'rank', v_rank, 'of', v_total, 'score', p.total_score, 'correct', p.correct_count,
      'questions', coalesce(array_length(s.question_ids, 1), 0), 'max_streak', p.max_streak,
      'grade', public._participant_grade(p.id),
      'fastest', p.id = (select a.participant_id from public.answers a join public.participants x on x.id = a.participant_id
                          where a.session_id = s.id and a.is_correct and not x.kicked
                          group by a.participant_id having count(*) >= greatest(1, coalesce(array_length(s.question_ids, 1), 0) / 2)
                          order by avg(a.time_ms) limit 1)));
  end if;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- ESTUDIANTE: enviar respuesta (corrección y puntos en el servidor)
-- ---------------------------------------------------------------------
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
  on conflict (participant_id, question_id) do nothing
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

-- Eventos del navegador (cambio de pestaña, pegar texto)
create or replace function public.report_event(p_token uuid, p_kind text)
returns void language sql security definer set search_path = '' as $$
  update public.participants
     set tab_switch_count = tab_switch_count + case when p_kind = 'tab' then 1 else 0 end,
         paste_count = paste_count + case when p_kind = 'paste' then 1 else 0 end
   where token = p_token and not kicked;
$$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  -- internas: nadie las llama directamente
  foreach f in array array['public._grade(uuid, jsonb)', 'public._student_question(uuid)', 'public._reveal_info(uuid)',
                           'public._leaderboard(uuid, integer)', 'public._participant_grade(uuid)', 'public._own_session(uuid)',
                           'public._display_order(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- docente
  foreach f in array array['public.create_session(uuid, uuid, jsonb)', 'public.host_advance(uuid, text)', 'public.host_pause(uuid, boolean)',
                           'public.host_add_time(uuid, integer)', 'public.host_end(uuid)', 'public.host_participant(uuid, text)',
                           'public.host_state(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- estudiante
  foreach f in array array['public.session_info(text)', 'public.lookup_student(text, text)',
                           'public.join_session(text, text, text, text, jsonb, text)', 'public.get_state(uuid)',
                           'public.submit_answer(uuid, uuid, jsonb)', 'public.report_event(uuid, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
