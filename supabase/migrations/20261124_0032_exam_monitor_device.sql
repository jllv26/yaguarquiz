-- 0032 · Examen: el docente ve en su monitor quién intenta entrar desde OTRO equipo (takeover_pending)
-- y lo autoriza con un botón («Cambiar de equipo»), igual que en el modo en vivo (host_participant 'authorize_device').

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
                  from public.attempts x where x.participant_id = p.id and x.submitted_at is null) as current,
               p.takeover_pending
          from public.participants p
          left join public.students st on st.id = p.student_id
         where p.session_id = s.id
        union all
        select null, st.id, null, null, false, 0, 0, st.university_code, st.last_names || ', ' || st.first_names,
               lower(st.last_names || ' ' || st.first_names), false, 0, s.max_attempts, null, null, null, null, 0, 0, null, false
          from public.enrollments e join public.students st on st.id = e.student_id
         where s.identification = 'roster' and e.subject_id = s.subject_id and e.active and st.active
           and not exists (select 1 from public.participants p where p.session_id = s.id and p.student_id = st.id)
      ) r), '[]'::jsonb));
end $$;
