-- 0023 · Actividades con versiones por estudiante: la pantalla de inicio muestra cuántas palabras
-- le tocan al estudiante (las de su versión), no el total del banco.
create or replace function public.activity_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st jsonb := public.exam_state(p_token);
  v_cur uuid;
  v_last public.attempts;
  v_type text;
  v_open_reveal boolean;
  v_var_n int;
begin
  if not coalesce((st ->> 'ok')::boolean, false) then return st; end if;
  v_cur := nullif(st -> 'current' ->> 'id', '')::uuid;
  select public._activity_type(s.quiz_id) into v_type
    from public.participants p join public.sessions s on s.id = p.session_id where p.token = p_token;
  st := st || jsonb_build_object('activity_type', v_type);
  -- con versiones por estudiante, cada uno resuelve solo las palabras de su versión (no todo el banco)
  select coalesce(jsonb_array_length(q.settings -> 'activity' -> 'variants' -> 0 -> 'pos'), 0) into v_var_n
    from public.participants p join public.sessions s on s.id = p.session_id join public.quizzes q on q.id = s.quiz_id
   where p.token = p_token;
  if v_var_n > 0 and v_type <> 'research' then
    st := jsonb_set(st, '{session,question_count}', to_jsonb(v_var_n));
  end if;
  -- evaluaciones normales: se devuelve exam_state tal cual
  if v_type is null then return st; end if;
  if v_cur is not null then
    -- las preguntas genéricas no hacen falta: el tablero trae todo lo necesario
    st := jsonb_set(st, '{current}', (st -> 'current') - 'questions' || jsonb_build_object('activity', public._activity_board(v_cur)));
  end if;
  if v_type = 'research' then
    -- investigación: no hay respuestas correctas que revisar; la nota la pone el docente
    return st - 'review' || jsonb_build_object('review', null);
  end if;
  if st -> 'review' is not null and jsonb_typeof(st -> 'review') = 'array' then
    select a.* into v_last from public.attempts a join public.participants p on p.id = a.participant_id
     where p.token = p_token and a.submitted_at is not null order by a.number desc limit 1;
    -- anti-trampa: mientras la actividad sigue abierta, la revisión dice qué estuvo bien o mal, pero no la respuesta
    select public._window(s) = 'closed' into v_open_reveal from public.sessions s where s.id = v_last.session_id;
    st := st || jsonb_build_object('review', (
      select jsonb_agg(jsonb_build_object(
               'clue', case when q.prompt = '' then null else q.prompt end, 'image_url', q.image_url,
               'answer', case when not coalesce(v_open_reveal, false) and not coalesce(an.is_correct, false) then null
                              when v_type = 'classify' then q.term || ' → ' || coalesce(q.tags[1], '') else q.term end,
               'hidden', not coalesce(v_open_reveal, false) and not coalesce(an.is_correct, false),
               'response', coalesce(an.response ->> 'value', ''),
               'correct', coalesce(an.is_correct, false), 'partial', coalesce(an.partial_score, 0)) order by t.ord)
        from unnest(v_last.question_ids) with ordinality as t(qid, ord)
        join public.questions q on q.id = t.qid
        left join public.answers an on an.attempt_id = v_last.id and an.question_id = t.qid));
  end if;
  return st;
end $$;

