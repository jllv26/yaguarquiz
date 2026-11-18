-- =====================================================================
-- YaguarQuiz UAP — Fase 6: reportes, libreta de notas (conversor) y datos para Google Sheets
-- Solo el docente dueño puede ver los reportes (todas las funciones validan auth.uid()).
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

-- Notas que el docente pone a mano (asistencia, exposiciones, proyecto final, etc.), sobre 100
create table if not exists public.manual_scores (
  teacher_id       uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  grading_item_id  uuid not null references public.grading_items (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  score            numeric not null check (score between 0 and 100),
  updated_at       timestamptz not null default now(),
  primary key (grading_item_id, student_id)
);
alter table public.manual_scores enable row level security;
drop policy if exists owner_select on public.manual_scores;
create policy owner_select on public.manual_scores for select to authenticated using (teacher_id = (select auth.uid()));
revoke all on public.manual_scores from anon;
grant select on public.manual_scores to authenticated;

create index if not exists idx_grade_adjustments_participant on public.grade_adjustments (participant_id, created_at desc);
create index if not exists idx_sheet_sync_session on public.sheet_sync_log (session_id, created_at desc);

-- ¿La sesión ya tiene resultados definitivos? (en vivo terminada, o examen/tarea cerrado)
create or replace function public._session_done(s public.sessions)
returns boolean language sql stable set search_path = '' as $$
  select s.status = 'finished' or (s.mode <> 'live' and s.scheduled_end is not null and s.scheduled_end <= now());
$$;

-- Intento que cuenta (el mejor) de cada participante en examen/tarea
create or replace function public._best_attempts(p_session uuid)
returns table (participant_id uuid, attempt_id uuid, grade numeric, correct_count int, score int, duration_ms bigint, focus_losses int, paste_count int, submit_reason text, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (a.participant_id) a.participant_id, a.id, a.grade, a.correct_count, a.score,
         (extract(epoch from (a.submitted_at - a.started_at)) * 1000)::bigint, a.focus_losses, a.paste_count, a.submit_reason, a.submitted_at
    from public.attempts a
   where a.session_id = p_session and a.submitted_at is not null
   order by a.participant_id, a.grade desc nulls last, a.submitted_at;
$$;

-- Respuestas que cuentan para el reporte (en vivo: todas; examen: las del mejor intento)
create or replace function public._counted_answers(p_session uuid)
returns setof public.answers language sql stable security definer set search_path = '' as $$
  select an.* from public.answers an
    join public.sessions s on s.id = an.session_id
   where an.session_id = p_session
     and ((s.mode = 'live' and an.attempt_id is null)
       or (s.mode <> 'live' and an.attempt_id in (select b.attempt_id from public._best_attempts(p_session) b)));
$$;

-- Texto legible de una respuesta (para el detalle y Google Sheets)
create or replace function public._response_text(p_question uuid, r jsonb)
returns text language sql stable security definer set search_path = '' as $$
  select case r ->> 'kind'
    when 'choice' then (select coalesce(nullif(o.text, ''), 'Imagen ' || o.sort_order + 1) from public.question_options o where o.id::text = r ->> 'key' and o.question_id = p_question)
    when 'choices' then (select string_agg(coalesce(nullif(o.text, ''), 'Imagen ' || o.sort_order + 1), ', ' order by o.sort_order)
                           from public.question_options o where o.question_id = p_question and r -> 'keys' ? o.id::text)
    when 'text' then r ->> 'text'
    when 'order' then (select string_agg(coalesce(nullif(o.text, ''), '?'), ' → ' order by k.ord)
                         from jsonb_array_elements_text(r -> 'keys') with ordinality as k(key, ord)
                         join public.question_options o on o.id::text = k.key and o.question_id = p_question)
  end;
$$;

-- Nota por participante de una sesión (con ajuste manual si existe)
create or replace function public._session_grades(p_session uuid)
returns table (participant_id uuid, student_id uuid, code text, name text, nickname text, avatar jsonb, kicked boolean,
               computed numeric, adjusted numeric, adjust_reason text, grade numeric, correct int, points int, time_ms bigint,
               tab_switches int, pastes int, attempts int, submit_reason text, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.sessions where id = p_session),
  b as (select * from public._best_attempts(p_session)),
  adj as (select distinct on (g.participant_id) g.participant_id, g.new_score, g.reason
            from public.grade_adjustments g join public.participants p on p.id = g.participant_id
           where p.session_id = p_session order by g.participant_id, g.created_at desc)
  select p.id, p.student_id, st.university_code, coalesce(st.last_names || ', ' || st.first_names, p.nickname), p.nickname, p.avatar, p.kicked,
         case when s.mode = 'live' then public._participant_grade(p.id) else b.grade end,
         adj.new_score, adj.reason,
         coalesce(adj.new_score, case when s.mode = 'live' then public._participant_grade(p.id) else b.grade end),
         case when s.mode = 'live' then p.correct_count else b.correct_count end,
         case when s.mode = 'live' then p.total_score else b.score end,
         case when s.mode = 'live' then (select coalesce(sum(an.time_ms), 0) from public.answers an where an.participant_id = p.id and an.attempt_id is null)
              else b.duration_ms end,
         p.tab_switch_count, p.paste_count,
         (select count(*)::int from public.attempts x where x.participant_id = p.id),
         b.submit_reason, b.submitted_at
    from s
    join public.participants p on p.session_id = s.id
    left join public.students st on st.id = p.student_id
    left join b on b.participant_id = p.id
    left join adj on adj.participant_id = p.id;
$$;

-- ---------------------------------------------------------------------
-- DOCENTE: reporte completo de una sesión
-- ---------------------------------------------------------------------
create or replace function public.session_report(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sessions; v jsonb;
begin
  select * into s from public.sessions where id = p_session and teacher_id = auth.uid();
  if s.id is null then raise exception 'La sesión no existe o no es tuya'; end if;
  if s.mode <> 'live' then perform public._finalize_expired(s.id); end if;

  select jsonb_build_object(
    'session', (
      select jsonb_build_object(
        'id', s.id, 'pin', s.pin, 'mode', s.mode, 'status', s.status, 'done', public._session_done(s),
        'created_at', s.created_at, 'finished_at', s.finished_at, 'opens_at', s.scheduled_start, 'closes_at', s.scheduled_end,
        'identification', s.identification, 'question_count', coalesce(s.pick_count, array_length(s.question_ids, 1)),
        'quiz_id', q.id, 'quiz_title', q.title, 'topic', t.name,
        'subject', jsonb_build_object('id', sb.id, 'code', sb.code, 'parallel', sb.parallel, 'name', sb.name, 'career', sb.career, 'theme_color', sb.theme_color),
        'period', pe.name, 'year', ay.year,
        'pass_mark', public._pass_mark(s.subject_id),
        'grading_item', (select jsonb_build_object('id', gi.id, 'term', gi.term, 'category', gi.category, 'weight', gi.weight)
                           from public.grading_items gi where gi.id = s.grading_item_id),
        'enrolled', case when s.identification = 'roster' then
                      (select count(*) from public.enrollments e join public.students x on x.id = e.student_id
                        where e.subject_id = s.subject_id and e.active and x.active) end,
        'last_sync', (select jsonb_build_object('status', l.status, 'error', l.error, 'at', l.created_at)
                        from public.sheet_sync_log l where l.session_id = s.id order by l.created_at desc limit 1))
        from public.quizzes q
        join public.subjects sb on sb.id = s.subject_id
        join public.periods pe on pe.id = sb.period_id
        join public.academic_years ay on ay.id = pe.academic_year_id
        left join public.topics t on t.id = q.topic_id
       where q.id = s.quiz_id),
    'students', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.name) from public._session_grades(s.id) g), '[]'::jsonb),
    'absent', case when s.identification = 'roster' then coalesce((
      select jsonb_agg(jsonb_build_object('student_id', x.id, 'code', x.university_code, 'name', x.last_names || ', ' || x.first_names)
                       order by x.last_names, x.first_names)
        from public.enrollments e join public.students x on x.id = e.student_id
       where e.subject_id = s.subject_id and e.active and x.active
         and not exists (select 1 from public.participants p where p.session_id = s.id and p.student_id = x.id)), '[]'::jsonb)
      else '[]'::jsonb end,
    'questions', coalesce((
      with ca as (select * from public._counted_answers(s.id))
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'index', ord, 'type', q.type, 'prompt', q.prompt, 'base_points', q.base_points,
               'answered', (select count(*) from ca where ca.question_id = q.id),
               'correct', (select count(*) from ca where ca.question_id = q.id and ca.is_correct),
               'avg_partial', (select round(avg(ca.partial_score), 4) from ca where ca.question_id = q.id),
               'avg_time_ms', (select round(avg(ca.time_ms)) from ca where ca.question_id = q.id and s.mode = 'live'),
               'accepted_answers', to_jsonb(q.accepted_answers),
               'options', coalesce((select jsonb_agg(jsonb_build_object(
                    'key', o.id, 'text', o.text, 'image_url', o.image_url, 'is_correct', o.is_correct,
                    'count', (select count(*) from ca where ca.question_id = q.id
                               and (ca.response ->> 'key' = o.id::text or coalesce(ca.response -> 'keys', '[]'::jsonb) ? o.id::text)))
                    order by o.sort_order) from public.question_options o where o.question_id = q.id), '[]'::jsonb),
               'top_wrong_text', case when q.type = 'short_text' then (
                    select ca.response ->> 'text' from ca where ca.question_id = q.id and not ca.is_correct
                     group by public.normalize_answer(ca.response ->> 'text'), ca.response ->> 'text' order by count(*) desc limit 1) end)
             order by ord)
        from unnest(s.question_ids) with ordinality as u(qid, ord)
        join public.questions q on q.id = u.qid), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Detalle: una fila por respuesta (estudiante, pregunta, respuesta, correcta, tiempo, puntos)
create or replace function public.session_answers(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session and teacher_id = auth.uid();
  if s.id is null then raise exception 'La sesión no existe o no es tuya'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'participant_id', ca.participant_id, 'code', st.university_code,
             'name', coalesce(st.last_names || ', ' || st.first_names, p.nickname),
             'question_id', ca.question_id, 'question_index', array_position(s.question_ids, ca.question_id),
             'prompt', q.prompt, 'answer', public._response_text(ca.question_id, ca.response),
             'correct', ca.is_correct, 'partial', ca.partial_score, 'time_ms', ca.time_ms, 'points', ca.game_points,
             'answered_at', ca.answered_at)
           order by coalesce(st.last_names, p.nickname), array_position(s.question_ids, ca.question_id))
      from public._counted_answers(s.id) ca
      join public.participants p on p.id = ca.participant_id
      left join public.students st on st.id = p.student_id
      join public.questions q on q.id = ca.question_id), '[]'::jsonb);
end $$;

-- Ajuste manual de nota (queda registrado con motivo; el último ajuste es el que vale)
create or replace function public.adjust_grade(p_participant uuid, p_score numeric, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.participants; v_old numeric;
begin
  select * into p from public.participants where id = p_participant and teacher_id = auth.uid();
  if p.id is null then raise exception 'El participante no existe o no es tuyo'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'La nota debe estar entre 0 y 100'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo del ajuste'; end if;
  select g.grade into v_old from public._session_grades(p.session_id) g where g.participant_id = p.id;
  insert into public.grade_adjustments (teacher_id, participant_id, old_score, new_score, reason)
  values (auth.uid(), p.id, v_old, round(p_score, 2), btrim(p_reason));
end $$;

-- Historial de ajustes de una sesión
create or replace function public.grade_history(p_session uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('participant_id', g.participant_id, 'old', g.old_score, 'new', g.new_score,
                                               'reason', g.reason, 'at', g.created_at) order by g.created_at desc), '[]'::jsonb)
    from public.grade_adjustments g join public.participants p on p.id = g.participant_id
   where p.session_id = p_session and g.teacher_id = auth.uid();
$$;

-- Vincular (o desvincular) una sesión con una categoría del plan de calificación
create or replace function public.set_session_item(p_session uuid, p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session and teacher_id = auth.uid();
  if s.id is null then raise exception 'La sesión no existe o no es tuya'; end if;
  if p_item is not null and not exists (
    select 1 from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id
     where gi.id = p_item and gp.subject_id = s.subject_id and gi.teacher_id = auth.uid()) then
    raise exception 'La categoría no corresponde a la asignatura de esta sesión';
  end if;
  update public.sessions set grading_item_id = p_item where id = s.id;
end $$;

-- ---------------------------------------------------------------------
-- DOCENTE: libreta de notas de una asignatura (datos para el conversor)
-- ---------------------------------------------------------------------
create or replace function public.gradebook(p_subject uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sb public.subjects; v_sessions jsonb := '[]'::jsonb; v_grades jsonb := '[]'::jsonb; r public.sessions;
begin
  select * into sb from public.subjects where id = p_subject and teacher_id = auth.uid();
  if sb.id is null then raise exception 'La asignatura no existe o no es tuya'; end if;

  for r in select s.* from public.sessions s
            where s.subject_id = sb.id and s.identification = 'roster'
              and exists (select 1 from public.participants p where p.session_id = s.id)
            order by coalesce(s.scheduled_start, s.created_at)
  loop
    if r.mode <> 'live' then perform public._finalize_expired(r.id); end if;
    v_sessions := v_sessions || jsonb_build_object(
      'id', r.id, 'mode', r.mode, 'title', (select title from public.quizzes where id = r.quiz_id),
      'date', coalesce(r.scheduled_start, r.created_at), 'grading_item_id', r.grading_item_id, 'done', public._session_done(r));
    v_grades := v_grades || coalesce((
      select jsonb_agg(jsonb_build_object('session_id', r.id, 'student_id', g.student_id, 'grade', g.grade))
        from public._session_grades(r.id) g where g.student_id is not null and not g.kicked), '[]'::jsonb);
  end loop;

  return jsonb_build_object(
    'subject', jsonb_build_object('id', sb.id, 'code', sb.code, 'parallel', sb.parallel, 'name', sb.name, 'career', sb.career,
                                  'period', (select name from public.periods where id = sb.period_id)),
    'plan', (select jsonb_build_object('id', gp.id, 'pass_mark', gp.pass_mark, 'max_score', gp.max_score,
                                       'items', coalesce((select jsonb_agg(jsonb_build_object('id', gi.id, 'term', gi.term, 'category', gi.category,
                                                                                              'weight', gi.weight, 'source', gi.source)
                                                                           order by gi.term, gi.sort_order, gi.category)
                                                            from public.grading_items gi where gi.plan_id = gp.id), '[]'::jsonb))
               from public.grading_plans gp where gp.subject_id = sb.id),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'code', x.university_code, 'name', x.last_names || ', ' || x.first_names)
                                           order by x.last_names, x.first_names)
                            from public.enrollments e join public.students x on x.id = e.student_id
                           where e.subject_id = sb.id and e.active and x.active), '[]'::jsonb),
    'sessions', v_sessions,
    'grades', v_grades,
    'manual', coalesce((select jsonb_agg(jsonb_build_object('item_id', m.grading_item_id, 'student_id', m.student_id, 'score', m.score))
                          from public.manual_scores m join public.grading_items gi on gi.id = m.grading_item_id
                          join public.grading_plans gp on gp.id = gi.plan_id
                         where gp.subject_id = sb.id and m.teacher_id = auth.uid()), '[]'::jsonb));
end $$;

-- Guardar una nota manual (null = borrar)
create or replace function public.save_manual_score(p_item uuid, p_student uuid, p_score numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.grading_items where id = p_item and teacher_id = auth.uid()) then
    raise exception 'La categoría no existe o no es tuya';
  end if;
  if not exists (select 1 from public.students where id = p_student and teacher_id = auth.uid()) then
    raise exception 'El estudiante no existe o no es tuyo';
  end if;
  if p_score is null then
    delete from public.manual_scores where grading_item_id = p_item and student_id = p_student;
    return;
  end if;
  if p_score < 0 or p_score > 100 then raise exception 'La nota debe estar entre 0 y 100'; end if;
  insert into public.manual_scores (teacher_id, grading_item_id, student_id, score)
  values (auth.uid(), p_item, p_student, round(p_score, 2))
  on conflict (grading_item_id, student_id) do update set score = excluded.score, updated_at = now();
end $$;

-- Registro de cada envío a Google Sheets
create or replace function public.log_sheet_sync(p_session uuid, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sessions where id = p_session and teacher_id = auth.uid()) then
    raise exception 'La sesión no existe o no es tuya';
  end if;
  insert into public.sheet_sync_log (teacher_id, session_id, status, error)
  values (auth.uid(), p_session, case when p_ok then 'ok' else 'error' end, left(p_error, 500));
end $$;

-- Sesiones con resultados (lista de Reportes)
create or replace function public.report_list()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.date desc), '[]'::jsonb) from (
    select s.id, s.mode, s.pin, coalesce(s.scheduled_start, s.created_at) as date, s.identification, public._session_done(s) as done,
           q.title as quiz_title, sb.id as subject_id, sb.code, sb.parallel, sb.name as subject_name, sb.theme_color,
           (select count(*) from public.participants p where p.session_id = s.id and not p.kicked) as participants,
           (select round(avg(g.grade), 1) from public._session_grades(s.id) g where not g.kicked and g.grade is not null) as average,
           (select l.status from public.sheet_sync_log l where l.session_id = s.id order by l.created_at desc limit 1) as sync_status,
           s.grading_item_id
      from public.sessions s
      join public.quizzes q on q.id = s.quiz_id
      join public.subjects sb on sb.id = s.subject_id
     where s.teacher_id = auth.uid()
       and exists (select 1 from public.participants p where p.session_id = s.id)) x;
$$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public._session_done(public.sessions)', 'public._best_attempts(uuid)', 'public._counted_answers(uuid)',
                           'public._response_text(uuid, jsonb)', 'public._session_grades(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.session_report(uuid)', 'public.session_answers(uuid)', 'public.adjust_grade(uuid, numeric, text)',
                           'public.grade_history(uuid)', 'public.set_session_item(uuid, uuid)', 'public.gradebook(uuid)',
                           'public.save_manual_score(uuid, uuid, numeric)', 'public.log_sheet_sync(uuid, boolean, text)',
                           'public.report_list()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
