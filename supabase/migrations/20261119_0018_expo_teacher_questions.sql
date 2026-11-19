-- =====================================================================
-- YaguarQuiz UAP · 0018 · El 50 % del docente en las exposiciones = 5 preguntas
--   El docente ya no califica con la rúbrica de los estudiantes: le hace 5 preguntas a cada expositor
--   y marca cada una como  Respondió (2) · Respondió a medias (1) · No respondió (0).
--   Su nota = suma ÷ (preguntas × 2) × 100, y pesa «teacher_weight» % (50 % por defecto) en la nota final.
--   Puede anotar qué preguntó (opcional) para su control.
--   settings.teacher_eval = 'rubric' vuelve al modo anterior; settings.teacher_q = cantidad de preguntas (5).
-- =====================================================================

alter table public.presentation_presenters add column if not exists teacher_notes text[];

create or replace function public._pres_teacher(p_scores int[], p_settings jsonb, p_rubric jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case when coalesce(p_settings ->> 'teacher_eval', 'questions') = 'rubric' then public._pres_score(p_scores, p_rubric)
              when p_scores is null or coalesce(array_length(p_scores, 1), 0) = 0 then null
              else round(100.0 * (select sum(s) from unnest(p_scores) s) / (array_length(p_scores, 1) * 2), 2) end;
$$;

create or replace function public._presentation_grades(p_pres uuid)
returns table (presenter_id uuid, student_id uuid, code text, name text, group_no int, topic text, day int, sort_order int,
               state text, duration_sec int, peer_n int, peer_avg numeric, teacher numeric, final numeric, criteria jsonb)
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.presentations where id = p_pres),
  w as (select greatest(0, least(100, coalesce((p.settings ->> 'teacher_weight')::numeric, 50))) / 100.0 as tw, p.rubric, p.settings from p),
  r as (
    select rv.presenter_id, count(*)::int as n, round(avg(public._pres_score(rv.scores, w.rubric)), 2) as avg_
      from public.presentation_reviews rv, w where rv.presentation_id = p_pres group by rv.presenter_id)
  select pp.id, s.id, s.university_code, s.last_names || ', ' || s.first_names, pp.group_no, pp.topic, pp.day, pp.sort_order,
         pp.state, pp.duration_sec, coalesce(r.n, 0), r.avg_, public._pres_teacher(pp.teacher_scores, w.settings, w.rubric),
         case when pp.state = 'absent' then 0
              when r.avg_ is not null and pp.teacher_scores is not null
                then round(w.tw * public._pres_teacher(pp.teacher_scores, w.settings, w.rubric) + (1 - w.tw) * r.avg_, 2)
              when r.avg_ is not null then r.avg_
              else public._pres_teacher(pp.teacher_scores, w.settings, w.rubric) end,
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
        'criteria', g.criteria, 'teacher_scores', to_jsonb(pp.teacher_scores), 'teacher_comment', pp.teacher_comment, 'teacher_notes', to_jsonb(pp.teacher_notes)))
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

drop function if exists public.presentation_teacher_score(uuid, integer[], text);
create or replace function public.presentation_teacher_score(p_presenter uuid, p_scores int[], p_comment text default null, p_notes text[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.presentations; pp public.presentation_presenters; v_n int;
begin
  select * into pp from public.presentation_presenters where id = p_presenter and teacher_id = auth.uid();
  if pp.id is null then raise exception 'El expositor no existe o no es suyo'; end if;
  select * into r from public.presentations where id = pp.presentation_id;
  if p_scores is not null then
    if coalesce(r.settings ->> 'teacher_eval', 'questions') = 'rubric' then
      if not public._rubric_valid(r.rubric, p_scores) then raise exception 'Califique todos los criterios'; end if;
    else
      v_n := greatest(1, least(10, coalesce((r.settings ->> 'teacher_q')::int, 5)));
      if coalesce(array_length(p_scores, 1), 0) <> v_n or exists (select 1 from unnest(p_scores) s where s is null or s not in (0, 1, 2)) then
        raise exception 'Marque las % preguntas (Respondió, A medias o No respondió)', v_n;
      end if;
    end if;
  end if;
  update public.presentation_presenters
     set teacher_scores = p_scores,
         teacher_comment = case when p_scores is null then null else nullif(btrim(coalesce(p_comment, '')), '') end,
         teacher_notes = case when p_scores is null then null else p_notes end
   where id = pp.id;
  return jsonb_build_object('ok', true, 'score', public._pres_teacher(p_scores, r.settings, r.rubric));
end $$;

revoke all on function public._pres_teacher(integer[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._presentation_grades(uuid) from public, anon, authenticated;
revoke all on function public.presentation_host(uuid) from public, anon;
grant execute on function public.presentation_host(uuid) to authenticated;
revoke all on function public.presentation_teacher_score(uuid, integer[], text, text[]) from public, anon;
grant execute on function public.presentation_teacher_score(uuid, integer[], text, text[]) to authenticated;

notify pgrst, 'reload schema';
