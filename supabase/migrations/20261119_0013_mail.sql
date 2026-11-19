-- =====================================================================
-- YaguarQuiz UAP · 0013 · Correos a los estudiantes (desde el Gmail del docente)
--   · Al lanzar una TAREA se pone en cola un aviso para cada estudiante inscrito con correo.
--   · Al entregar una tarea o actividad se pone en cola su nota (en EXAMEN, recién cuando cierra).
--   · El script de Google del docente (el mismo de Google Sheets) pide la cola cada 5 minutos con su
--     token (mail_pull), envía UN correo por estudiante con todo lo pendiente desde el Gmail del docente,
--     respetando el límite diario, y confirma (mail_ack). Lo que no alcanza sale al día siguiente.
--   · El estudiante sin correo registrado puede dejarlo al entrar (student_set_email).
-- =====================================================================

alter table public.teacher_settings add column if not exists mail_enabled boolean not null default false;

create table if not exists public.mail_outbox (
  id          bigserial primary key,
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  kind        text not null check (kind in ('assignment', 'grade')),
  ref_id      uuid not null,            -- sesión (aviso) o intento (nota)
  not_before  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  sent_at     timestamptz,
  tries       int not null default 0,
  error       text,
  unique (kind, ref_id, student_id)
);
create index if not exists idx_mail_pending on public.mail_outbox (teacher_id, not_before) where sent_at is null;
alter table public.mail_outbox enable row level security;
drop policy if exists mail_outbox_owner on public.mail_outbox;
create policy mail_outbox_owner on public.mail_outbox for select to authenticated using (teacher_id = auth.uid());
revoke all on public.mail_outbox from anon;
revoke insert, update, delete on public.mail_outbox from authenticated;

create or replace function public._mail_on() returns boolean language sql stable security definer set search_path = '' as $$
  select false;
$$;

-- Aviso de tarea: al crear una sesión en modo tarea
create or replace function public._mail_on_session() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.mode <> 'homework' then return new; end if;
  if not coalesce((select mail_enabled from public.teacher_settings where teacher_id = new.teacher_id), false) then return new; end if;
  insert into public.mail_outbox (teacher_id, student_id, kind, ref_id, not_before)
  select new.teacher_id, st.id, 'assignment', new.id, greatest(now(), coalesce(new.scheduled_start, now()) - interval '1 hour')
    from public.enrollments e join public.students st on st.id = e.student_id
   where e.subject_id = new.subject_id and e.active and st.active and st.email is not null and new.identification = 'roster'
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists mail_on_session on public.sessions;
create trigger mail_on_session after insert on public.sessions for each row execute function public._mail_on_session();

-- Nota: al entregar un intento (tarea/actividad: enseguida; examen: cuando cierra)
create or replace function public._mail_on_attempt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; v_student uuid;
begin
  if new.submitted_at is null or old.submitted_at is not null or new.grade is null then return new; end if;
  select * into s from public.sessions where id = new.session_id;
  if s.mode not in ('homework', 'exam') then return new; end if;
  if not coalesce((select mail_enabled from public.teacher_settings where teacher_id = s.teacher_id), false) then return new; end if;
  select p.student_id into v_student from public.participants p where p.id = new.participant_id;
  if v_student is null or not exists (select 1 from public.students where id = v_student and email is not null) then return new; end if;
  insert into public.mail_outbox (teacher_id, student_id, kind, ref_id, not_before)
  values (s.teacher_id, v_student, 'grade', new.id,
          case when s.mode = 'exam' then greatest(now(), coalesce(s.scheduled_end, 'infinity'::timestamptz)) else now() end)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists mail_on_attempt on public.attempts;
create trigger mail_on_attempt after update of submitted_at on public.attempts for each row execute function public._mail_on_attempt();

-- Si el docente cierra un examen antes de tiempo, sus notas salen ya
create or replace function public._mail_on_session_end() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'finished' and old.status <> 'finished' then
    update public.mail_outbox m set not_before = now()
      from public.attempts a where m.kind = 'grade' and m.ref_id = a.id and a.session_id = new.id and m.sent_at is null and m.not_before > now();
  end if;
  return new;
end $$;
drop trigger if exists mail_on_session_end on public.sessions;
create trigger mail_on_session_end after update of status on public.sessions for each row execute function public._mail_on_session_end();

-- ------------------------------------------------------------------ envío (lo llama el script de Google)
create or replace function public._esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;
create or replace function public._bo(t timestamptz) returns text language sql stable as $$
  select to_char(t at time zone 'America/La_Paz', 'DD/MM/YYYY HH24:MI');
$$;

-- Devuelve hasta p_max correos (uno por estudiante, con todos sus avisos y notas pendientes)
create or replace function public.mail_pull(p_token text, p_max int default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_teacher uuid;
  v_teacher_name text;
  v_site text := 'https://jllv26.github.io/yaguarquiz/';
  v_out jsonb := '[]'::jsonb;
  r record;
  v_items text;
  v_ids bigint[];
  v_n_assign int;
  v_n_grade int;
  v_subject text;
begin
  select ts.teacher_id, coalesce(nullif(t.full_name, ''), 'su docente') into v_teacher, v_teacher_name
    from public.teacher_settings ts join public.teachers t on t.id = ts.teacher_id
   where ts.sheets_token is not null and ts.sheets_token = p_token;
  if v_teacher is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if not coalesce((select mail_enabled from public.teacher_settings where teacher_id = v_teacher), false) then
    return jsonb_build_object('ok', true, 'enabled', false, 'messages', '[]'::jsonb);
  end if;

  for r in
    select m.student_id, st.email, st.first_names, st.last_names
      from public.mail_outbox m join public.students st on st.id = m.student_id
     where m.teacher_id = v_teacher and m.sent_at is null and m.not_before <= now() and m.tries < 5
       and (m.claimed_at is null or m.claimed_at < now() - interval '15 minutes') and st.email is not null
     group by m.student_id, st.email, st.first_names, st.last_names
     order by min(m.created_at)
     limit greatest(0, least(coalesce(p_max, 50), 100))
  loop
    v_ids := array(select id from public.mail_outbox m where m.teacher_id = v_teacher and m.student_id = r.student_id and m.sent_at is null
                     and m.not_before <= now() and m.tries < 5 and (m.claimed_at is null or m.claimed_at < now() - interval '15 minutes'));
    update public.mail_outbox set claimed_at = now(), tries = tries + 1 where id = any (v_ids);

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

    if v_n_assign + v_n_grade = 0 then
      -- nada vigente que contar (p. ej. la tarea ya cerró): se descarta en silencio
      update public.mail_outbox set sent_at = now(), error = 'vencido' where id = any (v_ids);
      continue;
    end if;
    select string_agg(distinct sj.code, ', ') into v_subject
      from public.mail_outbox m
      left join public.sessions s1 on m.kind = 'assignment' and s1.id = m.ref_id
      left join public.attempts a on m.kind = 'grade' and a.id = m.ref_id
      left join public.sessions s2 on s2.id = a.session_id
      join public.subjects sj on sj.id = coalesce(s1.subject_id, s2.subject_id)
     where m.id = any (v_ids);

    v_out := v_out || jsonb_build_object(
      'ids', to_jsonb(v_ids),
      'to', r.email,
      'subject', format('%s%s%s · %s',
                   case when v_n_assign > 0 then case when v_n_assign = 1 then 'Nueva tarea' else v_n_assign || ' tareas nuevas' end else '' end,
                   case when v_n_assign > 0 and v_n_grade > 0 then ' y ' else '' end,
                   case when v_n_grade > 0 then case when v_n_grade = 1 then case when v_n_assign > 0 then 'tu nota' else 'Tu nota' end else 'tus notas' end else '' end,
                   coalesce(v_subject, 'YaguarQuiz UAP')),
      'html', format(
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1f2937">'
        '<div style="background:#1F3864;color:#fff;padding:16px 20px;border-radius:14px 14px 0 0">'
        '<div style="font-size:20px;font-weight:900">Yaguar<span style="color:#FFD34D">Quiz</span> · UAP</div>'
        '<div style="font-size:12px;opacity:.85">Universidad Amazónica de Pando · Cobija</div></div>'
        '<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 14px 14px;padding:16px 20px">'
        '<p>Hola, <b>%s</b>:</p><table style="width:100%%;border-collapse:collapse">%s</table>'
        '<p style="font-size:12px;color:#6b7280;margin-top:16px">Entra con tu RU. Si el enlace no abre, ve a %s y escribe el PIN.<br>'
        'Mensaje automático de YaguarQuiz enviado por %s. Si tienes dudas, consulta en clase.</p></div></div>',
        public._esc(initcap(lower(split_part(r.first_names, ' ', 1)))), v_items, v_site, public._esc(v_teacher_name)));
  end loop;
  return jsonb_build_object('ok', true, 'enabled', true, 'messages', v_out);
end $$;

create or replace function public.mail_ack(p_token text, p_ids bigint[], p_ok boolean, p_error text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_teacher uuid;
begin
  select teacher_id into v_teacher from public.teacher_settings where sheets_token is not null and sheets_token = p_token;
  if v_teacher is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p_ok then
    update public.mail_outbox set sent_at = now(), error = null where teacher_id = v_teacher and id = any (p_ids);
  else
    update public.mail_outbox set claimed_at = null, error = left(coalesce(p_error, 'error'), 300) where teacher_id = v_teacher and id = any (p_ids);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ docente
create or replace function public.mail_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enabled', coalesce((select mail_enabled from public.teacher_settings where teacher_id = auth.uid()), false),
    'configured', exists (select 1 from public.teacher_settings where teacher_id = auth.uid() and sheets_webapp_url is not null and sheets_token is not null),
    'pending', (select count(*) from public.mail_outbox where teacher_id = auth.uid() and sent_at is null),
    'sent_today', (select count(distinct (student_id, date_trunc('minute', sent_at))) from public.mail_outbox where teacher_id = auth.uid() and error is null and sent_at >= date_trunc('day', now() at time zone 'America/La_Paz') at time zone 'America/La_Paz'),
    'last_sent', (select max(sent_at) from public.mail_outbox where teacher_id = auth.uid() and error is null),
    'last_error', (select error from public.mail_outbox where teacher_id = auth.uid() and error is not null and error <> 'vencido' order by id desc limit 1),
    'students', (select count(*) from public.students where teacher_id = auth.uid() and active),
    'with_email', (select count(*) from public.students where teacher_id = auth.uid() and active and email is not null));
$$;

create or replace function public.mail_set(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then raise exception 'Solo docentes'; end if;
  insert into public.teacher_settings (teacher_id, mail_enabled) values (auth.uid(), p_enabled)
  on conflict (teacher_id) do update set mail_enabled = excluded.mail_enabled, updated_at = now();
  return public.mail_status();
end $$;

-- ------------------------------------------------------------------ estudiante: dejar su correo al entrar
create or replace function public.student_email_needed(p_token uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select st.email is null from public.participants p join public.students st on st.id = p.student_id where p.token = p_token), false);
$$;

create or replace function public.student_set_email(p_token uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_student uuid; v_mail text := lower(btrim(coalesce(p_email, '')));
begin
  if v_mail !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or length(v_mail) > 120 then return jsonb_build_object('ok', false, 'error', 'email'); end if;
  select p.student_id into v_student from public.participants p where p.token = p_token;
  if v_student is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  -- solo se completa si no tenía; el docente puede corregirlo en Estudiantes
  update public.students set email = v_mail where id = v_student and email is null;
  -- avisos de tareas abiertas de sus materias que se perdió por no tener correo
  insert into public.mail_outbox (teacher_id, student_id, kind, ref_id)
  select s.teacher_id, v_student, 'assignment', s.id
    from public.sessions s join public.enrollments e on e.subject_id = s.subject_id and e.student_id = v_student and e.active
   where s.mode = 'homework' and s.status <> 'finished' and (s.scheduled_end is null or s.scheduled_end > now())
     and coalesce((select mail_enabled from public.teacher_settings where teacher_id = s.teacher_id), false)
     and not exists (select 1 from public.participants p2 join public.attempts a on a.participant_id = p2.id where p2.session_id = s.id and p2.student_id = v_student)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public._mail_on();
revoke all on function public._mail_on_session(), public._mail_on_attempt(), public._mail_on_session_end(), public._esc(text), public._bo(timestamptz) from public, anon, authenticated;
revoke all on function public.mail_pull(text, int), public.mail_ack(text, bigint[], boolean, text) from public;
grant execute on function public.mail_pull(text, int), public.mail_ack(text, bigint[], boolean, text) to anon, authenticated;
revoke all on function public.mail_status(), public.mail_set(boolean) from public, anon;
grant execute on function public.mail_status(), public.mail_set(boolean) to authenticated;
revoke all on function public.student_email_needed(uuid), public.student_set_email(uuid, text) from public;
grant execute on function public.student_email_needed(uuid), public.student_set_email(uuid, text) to anon, authenticated;
