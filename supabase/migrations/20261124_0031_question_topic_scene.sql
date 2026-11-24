-- 0031 · Preguntas más visuales: el estudiante recibe el TEMA de la pregunta (su primera etiqueta, p. ej. «G1 · Redes…»)
-- y la ESCENA del caso (extra.scene: un chat de WhatsApp, un anuncio de Facebook, un resultado de Google, un correo…).
-- La escena solo muestra la situación; nunca la respuesta.

create or replace function public._attempt_question(p_question uuid, p_attempt uuid, p_shuffle boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_type text; v_ord uuid[]; v_ok uuid[]; v_out jsonb;
begin
  select type into v_type from public.questions where id = p_question;
  if v_type = 'ordering' or (p_shuffle and v_type not in ('true_false')) then
    select array_agg(id order by md5(p_attempt::text || id::text)) into v_ord from public.question_options where question_id = p_question;
    if v_type = 'ordering' then
      select array_agg(id order by correct_position) into v_ok from public.question_options where question_id = p_question;
      if v_ord = v_ok and array_length(v_ord, 1) > 1 then
        select array_agg(x order by i desc) into v_ord from unnest(v_ord) with ordinality as t(x, i);
      end if;
    end if;
  else
    select array_agg(id order by sort_order) into v_ord from public.question_options where question_id = p_question;
  end if;
  select jsonb_build_object(
    'id', q.id, 'type', q.type, 'prompt', q.prompt, 'image_url', q.image_url,
    'time_limit_sec', q.time_limit_sec, 'base_points', q.base_points,
    'topic', q.tags[1], 'scene', q.extra -> 'scene',
    'options', coalesce((select jsonb_agg(jsonb_build_object('key', o.id, 'text', o.text, 'image_url', o.image_url)
                                          order by array_position(v_ord, o.id))
                           from public.question_options o where o.question_id = q.id), '[]'::jsonb))
    into v_out
    from public.questions q where q.id = p_question;
  return v_out;
end $$;

create or replace function public._student_question(p_question uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id, 'type', q.type, 'prompt', q.prompt, 'image_url', q.image_url,
    'time_limit_sec', q.time_limit_sec, 'base_points', q.base_points,
    'topic', q.tags[1], 'scene', q.extra -> 'scene',
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('key', o.id, 'text', o.text, 'image_url', o.image_url)
             order by array_position(public._display_order(q.id), o.id))
        from public.question_options o where o.question_id = q.id), '[]'::jsonb))
  from public.questions q where q.id = p_question;
$$;
