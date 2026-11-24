-- 0030 · La libreta y «Mis notas» incluyen TODAS las tareas y exámenes asignados, aunque nadie los haya abierto todavía.
-- Antes solo aparecían las sesiones con al menos un participante: una actividad asignada que nadie abrió no se veía
-- y, al cerrar, no contaba 0 para nadie. Las sesiones en vivo siguen apareciendo solo si alguien participó.

create or replace function public.gradebook(p_subject uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sb public.subjects; v_sessions jsonb := '[]'::jsonb; v_grades jsonb := '[]'::jsonb; r public.sessions;
begin
  select * into sb from public.subjects where id = p_subject and teacher_id = auth.uid();
  if sb.id is null then raise exception 'La asignatura no existe o no es tuya'; end if;

  for r in select s.* from public.sessions s
            where s.subject_id = sb.id and s.identification = 'roster'
              and (s.mode in ('homework', 'exam') or exists (select 1 from public.participants p where p.session_id = s.id))
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

create or replace function public.portal_grades(p_code text, p_ru text, p_ci text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sj public.subjects; st public.students; v_ci text; v_sessions jsonb := '[]'::jsonb; v_grades jsonb := '[]'::jsonb; r public.sessions;
begin
  select * into sj from public.subjects where upper(portal_code) = upper(btrim(coalesce(p_code, '')));
  if sj.id is null then return jsonb_build_object('ok', false, 'error', 'code'); end if;
  select s.* into st from public.students s join public.enrollments e on e.student_id = s.id and e.subject_id = sj.id and e.active
   where s.teacher_id = sj.teacher_id and s.university_code = btrim(coalesce(p_ru, '')) and s.active;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'ru'); end if;
  v_ci := regexp_replace(coalesce(st.ci, ''), '\D', '', 'g');
  if length(v_ci) >= 3 and right(v_ci, 3) <> regexp_replace(coalesce(p_ci, ''), '\D', '', 'g') then
    return jsonb_build_object('ok', false, 'error', 'ci');
  end if;

  -- mismas sesiones que la libreta del docente: con lista oficial (tareas/exámenes aunque nadie las haya abierto todavía)
  for r in select s.* from public.sessions s
            where s.subject_id = sj.id and s.identification = 'roster'
              and (s.mode in ('homework', 'exam') or exists (select 1 from public.participants p where p.session_id = s.id))
            order by coalesce(s.scheduled_start, s.created_at)
  loop
    if r.mode <> 'live' then perform public._finalize_expired(r.id); end if;
    v_sessions := v_sessions || jsonb_build_object(
      'id', r.id, 'mode', r.mode, 'title', (select title from public.quizzes where id = r.quiz_id),
      'date', coalesce(r.scheduled_start, r.created_at), 'grading_item_id', r.grading_item_id,
      'done', public._session_done(r), 'show_grade', r.show_grade);
    -- si el docente ocultó la nota, no se entrega hasta que la actividad cierre (tampoco por el promedio de la categoría)
    continue when not r.show_grade and not public._session_done(r);
    v_grades := v_grades || coalesce((
      select jsonb_agg(jsonb_build_object('session_id', r.id, 'student_id', g.student_id, 'grade', g.grade))
        from public._session_grades(r.id) g where g.student_id = st.id and not g.kicked), '[]'::jsonb);
  end loop;

  return jsonb_build_object('ok', true,
    'subject', jsonb_build_object('id', sj.id, 'code', sj.code, 'parallel', sj.parallel, 'name', sj.name, 'career', sj.career,
                                  'period', (select name from public.periods where id = sj.period_id)),
    'plan', (select jsonb_build_object('id', gp.id, 'pass_mark', gp.pass_mark, 'max_score', gp.max_score,
                                       'items', coalesce((select jsonb_agg(jsonb_build_object('id', gi.id, 'term', gi.term, 'category', gi.category,
                                                                                              'weight', gi.weight, 'source', gi.source)
                                                                           order by gi.term, gi.sort_order, gi.category)
                                                            from public.grading_items gi where gi.plan_id = gp.id), '[]'::jsonb))
               from public.grading_plans gp where gp.subject_id = sj.id),
    'students', jsonb_build_array(jsonb_build_object('id', st.id, 'code', st.university_code, 'name', st.last_names || ', ' || st.first_names)),
    'sessions', v_sessions,
    'grades', v_grades,
    'manual', coalesce((select jsonb_agg(jsonb_build_object('item_id', m.grading_item_id, 'student_id', m.student_id, 'score', m.score))
                          from public.manual_scores m join public.grading_items gi on gi.id = m.grading_item_id
                          join public.grading_plans gp on gp.id = gi.plan_id
                         where gp.subject_id = sj.id and m.student_id = st.id), '[]'::jsonb));
end $$;
revoke all on function public.portal_grades(text, text, text) from public;
grant execute on function public.portal_grades(text, text, text) to anon, authenticated;
