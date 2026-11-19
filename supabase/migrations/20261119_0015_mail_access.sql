-- =====================================================================
-- YaguarQuiz UAP · 0015 · Correo de acceso (credenciales y enlace)
--   El docente presiona «Enviar acceso por correo» en la lista de una asignatura: a cada estudiante
--   inscrito con correo le llega cómo entrar (enlace, que el PIN lo da el docente, su RU y, si se le
--   pide, los últimos 3 dígitos de su CI). Se envía por el mismo script de Google (desde el Gmail
--   del docente). Volver a presionar el botón lo reenvía.
-- =====================================================================

alter table public.mail_outbox drop constraint if exists mail_outbox_kind_check;
alter table public.mail_outbox add constraint mail_outbox_kind_check check (kind in ('assignment', 'grade', 'welcome'));

create or replace function public.mail_send_access(p_subject uuid, p_student uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.is_teacher() then raise exception 'Solo docentes'; end if;
  if not exists (select 1 from public.subjects where id = p_subject and teacher_id = auth.uid()) then raise exception 'La asignatura no es suya'; end if;
  if not coalesce((select mail_enabled from public.teacher_settings where teacher_id = auth.uid()), false) then
    return jsonb_build_object('ok', false, 'error', 'disabled');
  end if;
  insert into public.mail_outbox (teacher_id, student_id, kind, ref_id)
  select auth.uid(), st.id, 'welcome', p_subject
    from public.enrollments e join public.students st on st.id = e.student_id
   where e.subject_id = p_subject and e.active and st.active and st.email is not null
     and (p_student is null or st.id = p_student)
  on conflict (kind, ref_id, student_id) do update
     set sent_at = null, claimed_at = null, tries = 0, error = null, not_before = now(), created_at = now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'queued', v_n,
    'without_email', (select count(*) from public.enrollments e join public.students st on st.id = e.student_id
                       where e.subject_id = p_subject and e.active and st.active and st.email is null));
end $$;
revoke all on function public.mail_send_access(uuid, uuid) from public, anon;
grant execute on function public.mail_send_access(uuid, uuid) to authenticated;

-- mail_pull: agrega el bloque de acceso (va primero en el correo)
create or replace function public.mail_pull(p_token text, p_max int default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_teacher uuid;
  v_teacher_name text;
  v_site text := 'https://jllv26.github.io/yaguarquiz/';
  v_out jsonb := '[]'::jsonb;
  r record;
  v_items text;
  v_welcome text;
  v_ids bigint[];
  v_n_welcome int;
  v_n_assign int;
  v_n_grade int;
  v_subject text;
  v_title text;
begin
  select ts.teacher_id, coalesce(nullif(t.full_name, ''), 'su docente') into v_teacher, v_teacher_name
    from public.teacher_settings ts join public.teachers t on t.id = ts.teacher_id
   where ts.sheets_token is not null and ts.sheets_token = p_token;
  if v_teacher is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if not coalesce((select mail_enabled from public.teacher_settings where teacher_id = v_teacher), false) then
    return jsonb_build_object('ok', true, 'enabled', false, 'messages', '[]'::jsonb);
  end if;

  for r in
    select m.student_id, st.email, st.first_names, st.last_names, st.university_code, st.ci
      from public.mail_outbox m join public.students st on st.id = m.student_id
     where m.teacher_id = v_teacher and m.sent_at is null and m.not_before <= now() and m.tries < 5
       and (m.claimed_at is null or m.claimed_at < now() - interval '15 minutes') and st.email is not null
     group by m.student_id, st.email, st.first_names, st.last_names, st.university_code, st.ci
     order by min(m.created_at)
     limit greatest(0, least(coalesce(p_max, 50), 100))
  loop
    v_ids := array(select id from public.mail_outbox m where m.teacher_id = v_teacher and m.student_id = r.student_id and m.sent_at is null
                     and m.not_before <= now() and m.tries < 5 and (m.claimed_at is null or m.claimed_at < now() - interval '15 minutes'));
    update public.mail_outbox set claimed_at = now(), tries = tries + 1 where id = any (v_ids);

    -- acceso al sistema (credenciales y enlace)
    select count(*), string_agg(format(
             '<div style="background:#f3f6fb;border:1px solid #d6e0f0;border-radius:12px;padding:14px 16px;margin-bottom:14px">'
             '<div style="font-weight:900;color:#1F3864;font-size:16px;margin-bottom:6px">Tu acceso a YaguarQuiz · %s</div>'
             '<ol style="margin:0;padding-left:20px;line-height:1.7">'
             '<li>Entra a <a href="%s" style="color:#1d5fd6;font-weight:bold">%s</a> desde tu celular o la computadora (o escanea el código QR del proyector).</li>'
             '<li>Escribe el <b>PIN de 6 dígitos</b> que muestra el docente (en las tareas, el PIN llega en el correo de cada tarea).</li>'
             '<li>Tu usuario es tu <b>RU: <span style="font-size:18px;letter-spacing:1px">%s</span></b></li>'
             '%s'
             '</ol>'
             '<div style="font-size:12px;color:#4D4D4D;margin-top:8px">No necesitas contraseña ni crear una cuenta. No compartas tu RU ni tu CI: cada uno entra solo con lo suyo.</div></div>',
             public._esc(sj.code || ' – ' || sj.name), v_site, v_site, public._esc(r.university_code),
             case when length(regexp_replace(coalesce(r.ci, ''), '\D', '', 'g')) >= 3
                  then format('<li>Si te lo pide (exámenes): los <b>últimos 3 dígitos de tu CI: %s</b></li>', right(regexp_replace(r.ci, '\D', '', 'g'), 3))
                  else '' end), '')
      into v_n_welcome, v_welcome
      from public.mail_outbox m join public.subjects sj on sj.id = m.ref_id
     where m.id = any (v_ids) and m.kind = 'welcome';
    v_welcome := coalesce(v_welcome, '');

    -- avisos de tareas
    select count(*), string_agg(format(
             '<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb"><b style="color:#1F3864">%s</b><br>'
             '<span style="color:#4D4D4D;font-size:13px">%s · %s</span><br>'
             '<span style="font-size:13px">Disponible desde el <b>%s</b> hasta el <b>%s</b>%s</span><br>'
             '<a href="%s#/play/%s" style="display:inline-block;margin-top:8px;background:#1B7339;color:#fff;text-decoration:none;padding:8px 14px;border-radius:10px;font-weight:bold">Entrar · PIN %s</a></td></tr>',
             public._esc(q.title), public._esc(sj.code || ' – ' || sj.name),
             case when q.settings ? 'activity' then 'Actividad' else 'Tarea' end,
             public._bo(coalesce(s.scheduled_start, s.created_at)), coalesce(public._bo(s.scheduled_end), 'sin fecha de cierre'),
             case when s.max_attempts > 1 then format(' · %s intentos', s.max_attempts) else '' end,
             v_site, s.pin, s.pin), '' order by s.scheduled_end nulls last)
      into v_n_assign, v_items
      from public.mail_outbox m join public.sessions s on s.id = m.ref_id join public.quizzes q on q.id = s.quiz_id join public.subjects sj on sj.id = s.subject_id
     where m.id = any (v_ids) and m.kind = 'assignment' and s.status <> 'finished' and (s.scheduled_end is null or s.scheduled_end > now())
       and not exists (select 1 from public.participants p join public.attempts a2 on a2.participant_id = p.id
                        where p.session_id = s.id and p.student_id = m.student_id and a2.submitted_at is not null);
    v_items := coalesce(v_items, '');
    -- notas
    select count(*), v_items || coalesce(string_agg(format(
             '<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb"><b style="color:#1F3864">%s</b><br>'
             '<span style="color:#4D4D4D;font-size:13px">%s · intento %s · entregado el %s</span><br>'
             '<span style="font-size:22px;font-weight:900;color:%s">%s / 100</span>%s</td></tr>',
             public._esc(q.title), public._esc(sj.code || ' – ' || sj.name), a.number, public._bo(a.submitted_at),
             case when a.grade >= 51 then '#1B7339' else '#8B1A1A' end, trim(to_char(a.grade, 'FM990.##')),
             case when a.number < s.max_attempts and (s.scheduled_end is null or s.scheduled_end > now())
                  then format('<br><span style="font-size:13px">Te quedan %s intento(s) hasta el %s.</span>', s.max_attempts - a.number, coalesce(public._bo(s.scheduled_end), 'cierre'))
                  else '' end), '' order by a.submitted_at), '')
      into v_n_grade, v_items
      from public.mail_outbox m join public.attempts a on a.id = m.ref_id join public.sessions s on s.id = a.session_id
      join public.quizzes q on q.id = s.quiz_id join public.subjects sj on sj.id = s.subject_id
     where m.id = any (v_ids) and m.kind = 'grade' and a.grade is not null;

    if v_n_welcome + v_n_assign + v_n_grade = 0 then
      update public.mail_outbox set sent_at = now(), error = 'vencido' where id = any (v_ids);
      continue;
    end if;
    select string_agg(distinct sj.code, ', ') into v_subject
      from public.mail_outbox m
      left join public.sessions s1 on m.kind = 'assignment' and s1.id = m.ref_id
      left join public.attempts a on m.kind = 'grade' and a.id = m.ref_id
      left join public.sessions s2 on s2.id = a.session_id
      join public.subjects sj on sj.id = coalesce(case when m.kind = 'welcome' then m.ref_id end, s1.subject_id, s2.subject_id)
     where m.id = any (v_ids);

    v_title := concat_ws(' · ',
      case when v_n_welcome > 0 then 'Tu acceso a YaguarQuiz' end,
      case when v_n_assign = 1 then 'Nueva tarea' when v_n_assign > 1 then v_n_assign || ' tareas nuevas' end,
      case when v_n_grade = 1 then 'Tu nota' when v_n_grade > 1 then 'Tus notas' end,
      coalesce(v_subject, 'YaguarQuiz UAP'));

    v_out := v_out || jsonb_build_object(
      'ids', to_jsonb(v_ids),
      'to', r.email,
      'subject', v_title,
      'html', format(
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1f2937">'
        '<div style="background:#1F3864;color:#fff;padding:16px 20px;border-radius:14px 14px 0 0">'
        '<div style="font-size:20px;font-weight:900">Yaguar<span style="color:#FFD34D">Quiz</span> · UAP</div>'
        '<div style="font-size:12px;opacity:.85">Universidad Amazónica de Pando · Cobija</div></div>'
        '<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 14px 14px;padding:16px 20px">'
        '<p>Hola, <b>%s</b>:</p>%s%s'
        '<p style="font-size:12px;color:#6b7280;margin-top:16px">Entra con tu RU en %s · Mensaje automático de YaguarQuiz enviado por %s. Si tienes dudas, consulta en clase.</p></div></div>',
        public._esc(initcap(lower(split_part(r.first_names, ' ', 1)))), v_welcome,
        case when v_items <> '' then '<table style="width:100%;border-collapse:collapse">' || v_items || '</table>' else '' end,
        v_site, public._esc(v_teacher_name)));
  end loop;
  return jsonb_build_object('ok', true, 'enabled', true, 'messages', v_out);
end $$;
revoke all on function public.mail_pull(text, int) from public;
grant execute on function public.mail_pull(text, int) to anon, authenticated;
