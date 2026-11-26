-- 0034 · Examen: al terminar, el estudiante ve su nota también en puntos del parcial («5,6 / 7»).
-- Función nueva y aparte: no toca exam_state ni nada del examen. Si no existe, la pantalla sigue mostrando /100.

create or replace function public.exam_points(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'weight', gi.weight, 'category', gi.category, 'term', gi.term)
    from public.participants p
    join public.sessions s on s.id = p.session_id
    join public.grading_items gi on gi.id = s.grading_item_id
   where p.token = p_token and not p.kicked
$$;

grant execute on function public.exam_points(uuid) to anon, authenticated;
