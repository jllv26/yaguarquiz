-- =====================================================================
-- YaguarQuiz UAP · 0012 · Estudiantes sin CI registrado
--   Si la sesión o la exposición pide «últimos 3 dígitos del CI» y el estudiante no tiene CI en la
--   lista, entra solo con su RU (antes quedaba bloqueado). Quien sí tiene CI debe escribirlo bien.
-- =====================================================================

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
    -- Si el estudiante no tiene CI registrado, entra solo con su RU (no se le puede verificar)
    if s.require_ci and length(regexp_replace(coalesce(st.ci, ''), '\D', '', 'g')) >= 3
       and right(regexp_replace(coalesce(st.ci, ''), '\D', '', 'g'), 3) <> right(regexp_replace(coalesce(p_ci, ''), '\D', '', 'g'), 3) then
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

create or replace function public.presentation_join(p_pin text, p_code text, p_ci text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.presentations; st public.students; pa public.presentation_participants;
begin
  select * into r from public.presentations where pin = btrim(p_pin) and status <> 'closed' order by created_at desc limit 1;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  select s.* into st from public.students s join public.enrollments e on e.student_id = s.id and e.subject_id = r.subject_id and e.active
   where s.teacher_id = r.teacher_id and upper(regexp_replace(s.university_code, '\s+', '', 'g')) = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
   limit 1;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'not_enrolled'); end if;
  -- Si el estudiante no tiene CI registrado, entra solo con su RU (no se le puede verificar)
  if coalesce((r.settings ->> 'require_ci')::boolean, false) and length(regexp_replace(coalesce(st.ci, ''), '\D', '', 'g')) >= 3 and
     (right(regexp_replace(st.ci, '\D', '', 'g'), 3) <> right(regexp_replace(coalesce(p_ci, ''), '\D', '', 'g'), 3)
      or length(regexp_replace(coalesce(p_ci, ''), '\D', '', 'g')) < 3) then
    return jsonb_build_object('ok', false, 'error', 'bad_ci');
  end if;
  select * into pa from public.presentation_participants where presentation_id = r.id and student_id = st.id;
  if pa.id is not null then
    if pa.device_id is not null and p_device is not null and pa.device_id <> p_device then
      return jsonb_build_object('ok', false, 'error', 'other_device');
    end if;
    update public.presentation_participants set device_id = coalesce(device_id, p_device), last_ping = now() where id = pa.id;
    return jsonb_build_object('ok', true, 'token', pa.token, 'rejoined', true);
  end if;
  insert into public.presentation_participants (teacher_id, presentation_id, student_id, device_id)
  values (r.teacher_id, r.id, st.id, p_device)
  on conflict (presentation_id, student_id) do nothing
  returning * into pa;
  if pa.id is null then select * into pa from public.presentation_participants where presentation_id = r.id and student_id = st.id; end if;
  return jsonb_build_object('ok', true, 'token', pa.token, 'rejoined', false);
end $$;

-- La búsqueda del RU avisa si a ESTE estudiante se le pedirá el CI (solo si tiene CI registrado)
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
  return jsonb_build_object('ok', true, 'name', st.last_names || ', ' || st.first_names,
                            'require_ci', s.require_ci and length(regexp_replace(coalesce(st.ci, ''), '\D', '', 'g')) >= 3);
end $$;

create or replace function public.presentation_lookup(p_pin text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.presentations; st public.students;
begin
  select * into r from public.presentations where pin = btrim(p_pin) and status <> 'closed' order by created_at desc limit 1;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  select s.* into st from public.students s join public.enrollments e on e.student_id = s.id and e.subject_id = r.subject_id and e.active
   where s.teacher_id = r.teacher_id and upper(regexp_replace(s.university_code, '\s+', '', 'g')) = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
   limit 1;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'not_enrolled'); end if;
  return jsonb_build_object('ok', true, 'name', st.last_names || ', ' || st.first_names,
                            'require_ci', coalesce((r.settings ->> 'require_ci')::boolean, false)
                                          and length(regexp_replace(coalesce(st.ci, ''), '\D', '', 'g')) >= 3);
end $$;
