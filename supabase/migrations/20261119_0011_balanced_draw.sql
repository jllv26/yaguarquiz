-- =====================================================================
-- YaguarQuiz UAP · 0011 · Sorteo equilibrado de preguntas
--   Cuando se piden N preguntas al azar del banco:
--   · Se reparten por TEMA: la primera etiqueta de la pregunta (que no empiece con "var:").
--     Cada estudiante recibe casi la misma cantidad de preguntas de cada tema.
--   · Versiones de un mismo caso: las preguntas con la misma etiqueta "var:<nombre>" son
--     variantes (otros datos, otro negocio). A cada estudiante le toca solo una de ellas.
--   · Si el banco no tiene etiquetas, funciona igual que antes (al azar puro).
-- =====================================================================

create or replace function public._draw_questions(p_ids uuid[], p_pick int, p_shuffle boolean)
returns uuid[] language sql volatile security definer set search_path = '' as $$
  with q as (
    select t.x, t.ord,
           coalesce((select tg from unnest(qq.tags) tg where tg not like 'var:%' limit 1), '') as topic,
           coalesce((select tg from unnest(qq.tags) tg where tg like 'var:%' limit 1), t.x::text) as fam,
           random() as r
      from unnest(p_ids) with ordinality as t(x, ord)
      left join public.questions qq on qq.id = t.x
  ), fam as (
    select q.*, row_number() over (partition by fam order by r) as fam_rank from q
  ), ranked as (
    select fam.*, row_number() over (partition by topic, fam_rank > 1 order by random()) as rn from fam
  ), chosen as (
    select x, ord from ranked
     order by case when p_pick is null then 0 else (fam_rank > 1)::int end,
              case when p_pick is null then 0 else rn end,
              random()
     limit coalesce(p_pick, array_length(p_ids, 1))
  )
  select array_agg(x order by case when p_shuffle then random() else ord end) from chosen;
$$;
revoke all on function public._draw_questions(uuid[], int, boolean) from public, anon, authenticated;

create or replace function public.start_attempt(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.participants;
  s public.sessions;
  v_used int;
  v_ids uuid[];
  v_num int;
begin
  select * into p from public.participants where token = p_token for update;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.mode = 'live' then return jsonb_build_object('ok', false, 'error', 'mode'); end if;
  perform public._finalize_expired(s.id);
  if exists (select 1 from public.attempts where participant_id = p.id and submitted_at is null) then
    return public.exam_state(p_token);
  end if;
  if public._window(s) = 'not_open' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if public._window(s) = 'closed' then return jsonb_build_object('ok', false, 'error', 'finished'); end if;
  select count(*), coalesce(max(number), 0) + 1 into v_used, v_num from public.attempts where participant_id = p.id;
  if v_used >= s.max_attempts + p.extra_attempts then return jsonb_build_object('ok', false, 'error', 'no_attempts'); end if;

  -- Preguntas: al azar del banco (si se pidió), repartidas por tema y con una sola versión de cada caso
  v_ids := public._draw_questions(s.question_ids, s.pick_count, s.shuffle_questions);

  insert into public.attempts (teacher_id, session_id, participant_id, number, question_ids, deadline)
  values (p.teacher_id, s.id, p.id, v_num, v_ids,
          case when s.time_limit_sec is not null then now() + make_interval(secs => s.time_limit_sec) end);
  return public.exam_state(p_token);
exception when unique_violation then
  return public.exam_state(p_token);
end $$;
