-- =====================================================================
-- YaguarQuiz UAP · 0016 · PIN de la sala de exposiciones
--   · «Cambiar PIN» visible: uno al azar o uno elegido por el docente (6 dígitos, sin chocar con otro en uso).
--   · Al pasar a otro día de exposición, la sala recibe un PIN nuevo automáticamente.
--   Los que ya entraron siguen dentro; solo los que llegan necesitan el PIN nuevo.
-- =====================================================================

create or replace function public.presentation_control(p_id uuid, p_action text, p_target uuid default null, p_arg int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.presentations; v_next uuid;
begin
  r := public._own_presentation(p_id);
  -- cierra la exposición en curso guardando cuánto duró
  if p_action in ('next', 'start', 'end', 'absent', 'undo') and r.current_presenter is not null
     and (p_action <> 'absent' and p_action <> 'undo' or p_target = r.current_presenter) then
    update public.presentation_presenters
       set state = case when p_action = 'absent' then 'absent' when p_action = 'undo' then 'pending' else 'done' end,
           duration_sec = case when p_action in ('absent', 'undo') then null
                               else greatest(0, extract(epoch from now() - started_at)::int) end,
           started_at = case when p_action = 'undo' then null else started_at end
     where id = r.current_presenter and state = 'live';
    update public.presentations set current_presenter = null where id = r.id;
  end if;

  if p_action = 'open' then
    update public.presentations set status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'close' then
    update public.presentations set status = 'closed', current_presenter = null, updated_at = now() where id = r.id;
  elsif p_action = 'reopen' then
    if exists (select 1 from public.presentations where pin = r.pin and status <> 'closed' and id <> r.id)
       or exists (select 1 from public.sessions where pin = r.pin and status <> 'finished') then
      update public.presentations set pin = public._new_pres_pin() where id = r.id;
    end if;
    update public.presentations set status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'next' then
    select id into v_next from public.presentation_presenters
     where presentation_id = r.id and state = 'pending' and day = r.current_day order by sort_order, id limit 1;
    if v_next is null then return jsonb_build_object('ok', false, 'error', 'no_pending'); end if;
    update public.presentation_presenters set state = 'live', started_at = now(), duration_sec = null where id = v_next;
    update public.presentations set current_presenter = v_next, status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'start' then
    if not exists (select 1 from public.presentation_presenters where id = p_target and presentation_id = r.id) then raise exception 'Expositor no válido'; end if;
    update public.presentation_presenters set state = 'live', started_at = now(), duration_sec = null where id = p_target;
    update public.presentations set current_presenter = p_target, status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'absent' then
    update public.presentation_presenters set state = 'absent', started_at = null, duration_sec = null
     where id = p_target and presentation_id = r.id;
  elsif p_action = 'undo' then
    -- vuelve a "pendiente" y borra lo que recibió (como reiniciar en la Copa)
    delete from public.presentation_reviews where presenter_id = p_target and presentation_id = r.id;
    update public.presentation_presenters set state = 'pending', started_at = null, duration_sec = null
     where id = p_target and presentation_id = r.id;
  elsif p_action = 'reset_timer' then
    update public.presentation_presenters set started_at = now() where id = r.current_presenter and state = 'live';
  elsif p_action = 'day' then
    -- cada día de exposición tiene su propio PIN (como el «código de sala» de la Copa)
    update public.presentations set current_day = greatest(1, least(10, coalesce(p_arg, 1))),
           pin = case when current_day <> greatest(1, least(10, coalesce(p_arg, 1))) then public._new_pres_pin() else pin end
     where id = r.id;
  elsif p_action = 'set_pin' then
    -- PIN elegido por el docente (6 dígitos, que no esté en uso por otra sesión o exposición abierta)
    if p_arg is null or p_arg < 100000 or p_arg > 999999 then raise exception 'El PIN debe tener 6 dígitos'; end if;
    if exists (select 1 from public.presentations where pin = p_arg::text and status <> 'closed' and id <> r.id)
       or exists (select 1 from public.sessions where pin = p_arg::text and status <> 'finished') then
      raise exception 'Ese PIN ya está en uso; elija otro';
    end if;
    update public.presentations set pin = p_arg::text where id = r.id;
  elsif p_action = 'release' then
    update public.presentation_participants set device_id = null where id = p_target and presentation_id = r.id;
  elsif p_action = 'clear_tests' then
    delete from public.presentation_reviews where presentation_id = r.id;
    delete from public.presentation_participants where presentation_id = r.id;
    update public.presentation_presenters set state = 'pending', started_at = null, duration_sec = null, teacher_scores = null, teacher_comment = null
     where presentation_id = r.id;
    update public.presentations set current_presenter = null where id = r.id;
  elsif p_action = 'new_pin' then
    update public.presentations set pin = public._new_pres_pin() where id = r.id;
  elsif p_action <> 'end' then
    raise exception 'Acción no válida';
  end if;
  return jsonb_build_object('ok', true);
end $$;
