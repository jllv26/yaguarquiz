-- =====================================================================
-- YaguarQuiz UAP · 0020 · «Mi aula»: un solo código por asignatura
--   Cada asignatura tiene un código fijo (ej. ICOM261). El estudiante entra UNA vez con su RU
--   (y los 3 últimos dígitos de su CI) y ve TODAS sus actividades asignadas: pendientes, hechas
--   (con su nota) y vencidas; las abre con un botón, sin escribir PIN.
--   Los correos ahora llevan al aula en vez de un PIN por actividad.
-- =====================================================================

alter table public.subjects add column if not exists portal_code text;
create unique index if not exists idx_subjects_portal_code on public.subjects (upper(portal_code));

-- Código legible a partir de la sigla (ICOM 261 → ICOM261); si ya existe, se agrega el paralelo o números
create or replace function public._new_portal_code(p_code text, p_parallel text, p_self uuid default null)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_base text; v_try text; k int := 0;
begin
  v_base := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_base !~ '[A-Z]' then v_base := 'AULA' || v_base; end if;
  v_base := left(v_base, 12);
  loop
    v_try := case k when 0 then v_base
                    when 1 then v_base || upper(regexp_replace(coalesce(p_parallel, ''), '[^A-Za-z0-9]', '', 'g'))
                    else v_base || (100 + floor(random() * 900))::int end;
    exit when v_try <> '' and not exists (select 1 from public.subjects where upper(portal_code) = v_try and id is distinct from p_self);
    k := k + 1;
    if k > 40 then raise exception 'No se pudo generar el código del aula'; end if;
  end loop;
  return v_try;
end $$;

create or replace function public._subjects_portal_code()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.portal_code is null or btrim(new.portal_code) = '' then
    new.portal_code := public._new_portal_code(new.code, new.parallel, new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_subjects_portal_code on public.subjects;
create trigger trg_subjects_portal_code before insert on public.subjects
  for each row execute function public._subjects_portal_code();

do $$ declare r record; begin
  for r in select id, code, parallel from public.subjects where portal_code is null order by created_at loop
    update public.subjects set portal_code = public._new_portal_code(r.code, r.parallel, r.id) where id = r.id;
  end loop;
end $$;

-- El estudiante entra a su aula y ve sus actividades
create or replace function public.portal_lookup(p_code text, p_ru text, p_ci text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sj public.subjects; st public.students; v_ci text; v_items jsonb;
begin
  select * into sj from public.subjects where upper(portal_code) = upper(btrim(coalesce(p_code, '')));
  if sj.id is null then return jsonb_build_object('ok', false, 'error', 'code'); end if;
  if coalesce(btrim(p_ru), '') = '' then
    return jsonb_build_object('ok', true, 'step', 'ru', 'subject', sj.code || ' – ' || sj.name, 'parallel', sj.parallel);
  end if;
  select s.* into st from public.students s join public.enrollments e on e.student_id = s.id and e.subject_id = sj.id and e.active
   where s.teacher_id = sj.teacher_id and s.university_code = btrim(p_ru) and s.active;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'ru'); end if;
  v_ci := regexp_replace(coalesce(st.ci, ''), '\D', '', 'g');
  if length(v_ci) >= 3 then
    if coalesce(btrim(p_ci), '') = '' then
      return jsonb_build_object('ok', true, 'step', 'ci', 'subject', sj.code || ' – ' || sj.name, 'name', initcap(lower(split_part(st.first_names, ' ', 1))));
    end if;
    if right(v_ci, 3) <> regexp_replace(p_ci, '\D', '', 'g') then return jsonb_build_object('ok', false, 'error', 'ci'); end if;
  end if;

  select coalesce(jsonb_agg(x order by x.ord, x.closes nulls last, x.title), '[]'::jsonb) into v_items from (
    select s.id, s.pin, s.mode, q.title, q.settings -> 'activity' ->> 'type' as activity,
           s.scheduled_start as opens, s.scheduled_end as closes, s.max_attempts, s.time_limit_sec,
           public._window(s) as win, gi.category,
           coalesce(st2.done, 0) as done, st2.best, coalesce(st2.in_progress, false) as in_progress,
           case public._window(s) when 'open' then 0 when 'not_open' then 1 else 2 end as ord
      from public.sessions s
      join public.quizzes q on q.id = s.quiz_id
      left join public.grading_items gi on gi.id = s.grading_item_id
      left join lateral (
        select count(*) filter (where a.submitted_at is not null) as done,
               max(a.grade) filter (where a.submitted_at is not null) as best,
               bool_or(a.submitted_at is null) as in_progress
          from public.participants p join public.attempts a on a.participant_id = p.id
         where p.session_id = s.id and p.student_id = st.id) st2 on true
     where s.subject_id = sj.id and s.mode in ('homework', 'exam')
       and (public._window(s) <> 'closed' or st2.done > 0 or coalesce(s.scheduled_end, s.created_at) > now() - interval '21 days')
  ) x;

  return jsonb_build_object('ok', true, 'step', 'list',
    'subject', sj.code || ' – ' || sj.name, 'parallel', sj.parallel, 'code', sj.portal_code,
    'student', jsonb_build_object('name', initcap(lower(st.first_names)) || ' ' || initcap(lower(st.last_names)), 'ru', st.university_code),
    'items', v_items);
end $$;

-- El docente puede ver o cambiar el código de su aula
create or replace function public.portal_set_code(p_subject uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not exists (select 1 from public.subjects where id = p_subject and teacher_id = auth.uid()) then raise exception 'La asignatura no es suya'; end if;
  if length(v) < 4 or length(v) > 14 or v !~ '[A-Z]' then raise exception 'El código debe tener de 4 a 14 letras o números (con al menos una letra)'; end if;
  if exists (select 1 from public.subjects where upper(portal_code) = v and id <> p_subject) then raise exception 'Ese código ya lo usa otra asignatura'; end if;
  update public.subjects set portal_code = v where id = p_subject;
  return jsonb_build_object('ok', true, 'code', v);
end $$;

revoke all on function public._new_portal_code(text, text, uuid) from public, anon, authenticated;
revoke all on function public.portal_lookup(text, text, text) from public;
grant execute on function public.portal_lookup(text, text, text) to anon, authenticated;
revoke all on function public.portal_set_code(uuid, text) from public, anon;
grant execute on function public.portal_set_code(uuid, text) to authenticated;

-- Correos: el botón lleva al aula (no a un PIN por actividad)
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
             '<li>Entra a tu aula: <a href="%s#/aula/%s" style="color:#1d5fd6;font-weight:bold">%s#/aula/%s</a> (código del aula: <b>%s</b>). Ahí ves <b>todas tus actividades</b> y tus notas.</li>'
             '<li>Tu usuario es tu <b>RU: <span style="font-size:18px;letter-spacing:1px">%s</span></b></li>'
             '%s'
             '<li>En clase, para un juego en vivo, escribe el <b>PIN de 6 dígitos</b> que muestra el docente en el proyector.</li>'
             '</ol>'
             '<a href="%s#/aula/%s" style="display:inline-block;margin-top:10px;background:#1B7339;color:#fff;text-decoration:none;padding:9px 16px;border-radius:10px;font-weight:bold">Entrar a mis actividades</a>'
             '<div style="font-size:12px;color:#4D4D4D;margin-top:8px">No necesitas contraseña ni crear una cuenta. No compartas tu RU ni tu CI: cada uno entra solo con lo suyo.</div></div>',
             public._esc(sj.code || ' – ' || sj.name), v_site, sj.portal_code, v_site, sj.portal_code, sj.portal_code, public._esc(r.university_code),
             case when length(regexp_replace(coalesce(r.ci, ''), '\D', '', 'g')) >= 3
                  then format('<li>Tu clave: los <b>últimos 3 dígitos de tu CI: %s</b></li>', right(regexp_replace(r.ci, '\D', '', 'g'), 3))
                  else '' end, v_site, sj.portal_code), '')
      into v_n_welcome, v_welcome
      from public.mail_outbox m join public.subjects sj on sj.id = m.ref_id
     where m.id = any (v_ids) and m.kind = 'welcome';
    v_welcome := coalesce(v_welcome, '');

    -- avisos de tareas
    select count(*), string_agg(format(
             '<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb"><b style="color:#1F3864">%s</b><br>'
             '<span style="color:#4D4D4D;font-size:13px">%s · %s</span><br>'
             '<span style="font-size:13px">Disponible desde el <b>%s</b> hasta el <b>%s</b>%s</span><br>'
             '<a href="%s#/aula/%s" style="display:inline-block;margin-top:8px;background:#1B7339;color:#fff;text-decoration:none;padding:8px 14px;border-radius:10px;font-weight:bold">Hacerla en mi aula</a></td></tr>',
             public._esc(q.title), public._esc(sj.code || ' – ' || sj.name),
             case when q.settings ? 'activity' then 'Actividad' else 'Tarea' end,
             public._bo(coalesce(s.scheduled_start, s.created_at)), coalesce(public._bo(s.scheduled_end), 'sin fecha de cierre'),
             case when s.max_attempts > 1 then format(' · %s intentos', s.max_attempts) else '' end,
             v_site, sj.portal_code), '' order by s.scheduled_end nulls last)
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
        '<p style="font-size:12px;color:#6b7280;margin-top:16px">Tus actividades y notas: %s · Mensaje automático de YaguarQuiz enviado por %s. Si tienes dudas, consulta en clase.</p></div></div>',
        public._esc(initcap(lower(split_part(r.first_names, ' ', 1)))), v_welcome,
        case when v_items <> '' then '<table style="width:100%;border-collapse:collapse">' || v_items || '</table>' else '' end,
        coalesce(v_site || '#/aula/' || (select sj.portal_code from public.mail_outbox m
                 left join public.sessions s1 on m.kind = 'assignment' and s1.id = m.ref_id
                 left join public.attempts a on m.kind = 'grade' and a.id = m.ref_id
                 left join public.sessions s2 on s2.id = a.session_id
                 join public.subjects sj on sj.id = coalesce(case when m.kind = 'welcome' then m.ref_id end, s1.subject_id, s2.subject_id)
                where m.id = any (v_ids) limit 1), v_site), public._esc(v_teacher_name)));
  end loop;
  return jsonb_build_object('ok', true, 'enabled', true, 'messages', v_out);
end $$;
revoke all on function public.mail_pull(text, int) from public;
grant execute on function public.mail_pull(text, int) to anon, authenticated;

notify pgrst, 'reload schema';
