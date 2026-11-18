-- =====================================================================
-- YaguarQuiz UAP · 0008 · Tema visual de la sesión (Fase 7)
-- El estudiante solo conoce el PIN: esta función devuelve el tema visual de la
-- evaluación de esa sesión (dato no sensible). Nada más.
-- =====================================================================
create or replace function public.session_theme(p_pin text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(q.visual_theme, 'amazonia')
  from public.sessions s join public.quizzes q on q.id = s.quiz_id
  where s.pin = btrim(p_pin)
  order by (s.status <> 'finished') desc, s.created_at desc
  limit 1
$$;
revoke all on function public.session_theme(text) from public;
grant execute on function public.session_theme(text) to anon, authenticated;
