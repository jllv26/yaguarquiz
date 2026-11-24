-- 0027 · Eliminar una tarea, examen o partida (sesión) desde el panel docente.
-- Desaparece del aula de los estudiantes y de la libreta. Borra también sus intentos y respuestas
-- (por las claves foráneas «on delete cascade») y los correos pendientes que se refieren a ella.

create or replace function public.delete_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_attempts int;
  v_mails int;
begin
  select q.title into v_title
    from public.sessions s join public.quizzes q on q.id = s.quiz_id
   where s.id = p_session and s.teacher_id = auth.uid();
  if not found then
    raise exception 'No se encontró la sesión o no es suya' using errcode = '42501';
  end if;

  select count(*) into v_attempts
    from public.attempts a join public.participants p on p.id = a.participant_id
   where p.session_id = p_session and a.submitted_at is not null;

  -- correos de aviso de esta tarea y de notas de sus intentos que aún no salieron
  with gone as (
    delete from public.mail_outbox m
     where m.sent_at is null
       and ((m.kind = 'assignment' and m.ref_id = p_session)
         or (m.kind = 'grade' and m.ref_id in (select a.id from public.attempts a join public.participants p on p.id = a.participant_id where p.session_id = p_session)))
    returning 1)
  select count(*) into v_mails from gone;
  -- los ya enviados quedan sin referencia: se borran también para no dejar restos
  delete from public.mail_outbox m
   where (m.kind = 'assignment' and m.ref_id = p_session)
      or (m.kind = 'grade' and m.ref_id in (select a.id from public.attempts a join public.participants p on p.id = a.participant_id where p.session_id = p_session));

  delete from public.sessions where id = p_session;

  return jsonb_build_object('ok', true, 'title', v_title, 'attempts', v_attempts, 'mails_cancelled', v_mails);
end;
$$;

revoke all on function public.delete_session(uuid) from public, anon;
grant execute on function public.delete_session(uuid) to authenticated;
