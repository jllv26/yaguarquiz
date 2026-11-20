-- =====================================================================
-- YaguarQuiz UAP · 0021 · Actividades distintas para cada estudiante + Investigaciones
--   1. VERSIONES (settings.activity.variants): el crucigrama, la sopa de letras y «completa el texto»
--      pueden tener varias versiones con palabras/números distintos. A cada estudiante le toca la
--      versión menos usada (y en otro intento, una distinta). Una foto del compañero no le sirve.
--   2. INVESTIGACIÓN (tipo 'research'): cada estudiante recibe un CASO distinto (otra versión),
--      responde con sus palabras (no se puede pegar) y el docente califica cada criterio:
--      Cumple (2) · A medias (1) · No cumple (0). Nota = puntos ÷ (criterios × 2) × 100.
-- =====================================================================

alter table public.attempts add column if not exists variant int;

create or replace function public.start_attempt(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.participants;
  s public.sessions;
  v_used int;
  v_ids uuid[];
  v_num int;
  v_act jsonb;
  v_nv int;
  v_var int;
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

  -- Actividades con VERSIONES (tableros distintos o casos de investigación): a cada estudiante le toca
  -- la versión menos usada en la sesión, y en un nuevo intento, otra distinta a la anterior.
  select settings -> 'activity' into v_act from public.quizzes where id = s.quiz_id;
  v_nv := case when jsonb_typeof(v_act -> 'variants') = 'array' then jsonb_array_length(v_act -> 'variants') else 0 end;
  if v_nv > 0 then
    select k into v_var from generate_series(0, v_nv - 1) k
     order by (k = (select x.variant from public.attempts x where x.participant_id = p.id order by x.number desc limit 1)) nulls first,
              (select count(*) from public.attempts x where x.session_id = s.id and x.variant = k),
              random()
     limit 1;
    if v_act ->> 'type' <> 'research' then
      -- solo las palabras de esa versión (por su posición en la actividad)
      select array_agg(q.id order by t.o) into v_ids
        from jsonb_array_elements_text(v_act -> 'variants' -> v_var -> 'pos') with ordinality as t(pos, o)
        join (select x.id, (row_number() over (order by x.sort_order, x.id) - 1)::int as rpos
                from public.questions x where x.quiz_id = s.quiz_id and x.type = 'game_item') q on q.rpos = t.pos::int;
    end if;
  end if;

  insert into public.attempts (teacher_id, session_id, participant_id, number, question_ids, deadline, variant)
  values (p.teacher_id, s.id, p.id, v_num, v_ids,
          case when s.time_limit_sec is not null then now() + make_interval(secs => s.time_limit_sec) end, v_var);
  return public.exam_state(p_token);
exception when unique_violation then
  return public.exam_state(p_token);
end $$;

create or replace function public._activity_board(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.attempts;
  s public.sessions;
  v_act jsonb;
  v_type text;
  v_items jsonb;
  v_board jsonb := '{}'::jsonb;
  v_progress jsonb;
  v_reveal boolean;
begin
  select * into a from public.attempts where id = p_attempt;
  select * into s from public.sessions where id = a.session_id;
  select settings -> 'activity' into v_act from public.quizzes where id = s.quiz_id;
  -- la versión del estudiante reemplaza el tablero (layout, grid, text, case…)
  if a.variant is not null and jsonb_typeof(v_act -> 'variants') = 'array' then
    v_act := v_act || ((v_act -> 'variants' -> a.variant) - 'pos');
  end if;
  v_type := v_act ->> 'type';
  v_reveal := public._window(s) = 'closed';  -- anti-trampa: las respuestas correctas se ven recién al cerrar la actividad

  -- Palabras del intento con su posición original (los tableros fijos se refieren a ella)
  -- (posición = orden relativo dentro de la actividad, así una copia de la actividad sigue funcionando)
  select jsonb_agg(jsonb_build_object('id', q.id, 'pos', q.rpos, 'ord', t.ord, 'term', q.term, 'prompt', q.prompt,
           'image_url', q.image_url, 'grp', case when q.tags[1] = 'contiene' then null else q.tags[1] end,
           'contains', 'contiene' = any (q.tags)))
    into v_items
    from unnest(a.question_ids) with ordinality as t(qid, ord)
    join (select x.*, (row_number() over (order by x.sort_order, x.id) - 1)::int as rpos
            from public.questions x where x.quiz_id = s.quiz_id and x.type = 'game_item') q on q.id = t.qid;
  v_items := coalesce(v_items, '[]'::jsonb);

  if v_type = 'crossword' then
    v_board := jsonb_build_object(
      'rows', (v_act -> 'layout' ->> 'rows')::int, 'cols', (v_act -> 'layout' ->> 'cols')::int,
      'words', (select jsonb_agg(jsonb_build_object(
                   'key', g.id, 'n', (w ->> 'n')::int, 'row', (w ->> 'row')::int, 'col', (w ->> 'col')::int, 'dir', w ->> 'dir',
                   'len', length(replace(public._game_norm(g.term), ' ', '')), 'clue', g.prompt, 'image_url', g.image_url)
                   order by (w ->> 'n')::int, w ->> 'dir')
                  from jsonb_array_elements(v_act -> 'layout' -> 'words') w join jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean) on g.pos = (w ->> 'i')::int));
  elsif v_type = 'wordsearch' then
    v_board := jsonb_build_object(
      'grid', v_act -> 'grid' -> 'letters', 'show_words', coalesce((v_act ->> 'show_words')::boolean, true),
      'clues', (select jsonb_agg(jsonb_build_object('key', g.id,
                   'text', case when coalesce((v_act ->> 'show_words')::boolean, true) then public._game_norm(g.term) else g.prompt end,
                   'len', case when coalesce((v_act ->> 'show_words')::boolean, true) then null else length(replace(public._game_norm(g.term), ' ', '')) end,
                   'image_url', g.image_url) order by g.pos) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)));
  elsif v_type = 'matching' then
    v_board := jsonb_build_object(
      'left', (select jsonb_agg(jsonb_build_object('key', g.id, 'text', g.term) order by g.ord) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)),
      'right', (select jsonb_agg(jsonb_build_object('key', public._gkey(a.game_salt, g.id, 'd'), 'text', g.prompt, 'image_url', g.image_url)
                       order by md5(a.game_salt || g.id::text || 'r')) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)));
  elsif v_type = 'memory' then
    v_board := jsonb_build_object('cards', (select jsonb_agg(c order by md5(a.game_salt || (c ->> 'key'))) from (
        select jsonb_build_object('key', public._gkey(a.game_salt, g.id, 't'), 'text', g.term) c from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)
        union all
        select jsonb_build_object('key', public._gkey(a.game_salt, g.id, 'd'), 'text', g.prompt, 'image_url', g.image_url) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)) x));
  elsif v_type = 'fill_text' then
    v_board := jsonb_build_object(
      'text', v_act ->> 'text',
      'gaps', (select jsonb_agg(jsonb_build_object('key', g.id, 'i', g.pos, 'len', char_length(g.term)) order by g.pos) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)),
      'bank', case when coalesce((v_act ->> 'word_bank')::boolean, true) then
                (select jsonb_agg(w order by md5(a.game_salt || w)) from (
                   select g.term w from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)
                   union all
                   select btrim(x) from jsonb_array_elements_text(coalesce(v_act -> 'distractors', '[]'::jsonb)) x where btrim(x) <> '') b) end);
  elsif v_type = 'rosco' then
    v_board := jsonb_build_object('items', (select jsonb_agg(jsonb_build_object(
                 'key', g.id, 'letter', coalesce(upper(left(g.grp, 1)), left(public._game_norm(g.term), 1)), 'contains', g.contains, 'clue', g.prompt, 'image_url', g.image_url)
                 order by g.pos) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)));
  elsif v_type = 'anagram' then
    v_board := jsonb_build_object('items', (select jsonb_agg(jsonb_build_object(
                 'key', g.id, 'clue', g.prompt, 'image_url', g.image_url,
                 'words', (select jsonb_agg(length(x)) from unnest(string_to_array(public._game_norm(g.term), ' ')) x),
                 'tiles', (select case when string_agg(c, '' order by md5(a.game_salt || g.id::text || i)) = replace(public._game_norm(g.term), ' ', '')
                                       then jsonb_agg(c order by i desc) else jsonb_agg(c order by md5(a.game_salt || g.id::text || i)) end
                             from unnest(string_to_array(replace(public._game_norm(g.term), ' ', ''), null)) with ordinality as t(c, i)))
                 order by g.ord) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)));
  elsif v_type = 'sentence' then
    v_board := jsonb_build_object('items', (select jsonb_agg(jsonb_build_object(
                 'key', g.id, 'clue', g.prompt, 'image_url', g.image_url,
                 'tiles', (select case when count(*) > 1 and string_agg(w, ' ' order by md5(a.game_salt || g.id::text || i)) = btrim(regexp_replace(g.term, '\s+', ' ', 'g'))
                                       then jsonb_agg(w order by i desc) else jsonb_agg(w order by md5(a.game_salt || g.id::text || i)) end
                             from unnest(regexp_split_to_array(btrim(g.term), '\s+')) with ordinality as t(w, i)))
                 order by g.ord) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)));
  elsif v_type = 'hangman' then
    v_board := jsonb_build_object('max_wrong', 6, 'items', (select jsonb_agg(jsonb_build_object(
                 'key', g.id, 'clue', g.prompt, 'image_url', g.image_url,
                 'mask', public._hangman_mask(g.term, (select array(select jsonb_array_elements_text(an.response -> 'letters'))
                                                         from public.answers an where an.attempt_id = a.id and an.question_id = g.id)))
                 order by g.ord) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)));
  elsif v_type = 'research' then
    v_board := jsonb_build_object(
      'case', v_act -> 'case', 'criteria', coalesce(v_act -> 'criteria', '[]'::jsonb),
      'min_words', coalesce((v_act ->> 'min_words')::int, 40),
      'questions', (select jsonb_agg(jsonb_build_object('key', g.id, 'text', g.term, 'hint', nullif(g.prompt, ''),
                      'value', (select an.response ->> 'value' from public.answers an where an.attempt_id = a.id and an.question_id = g.id))
                      order by g.ord) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)));
  elsif v_type = 'classify' then
    v_board := jsonb_build_object(
      'groups', (select jsonb_agg(x order by md5(a.game_salt || x)) from (select distinct g.grp x from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean) where g.grp is not null) d),
      'cards', (select jsonb_agg(jsonb_build_object('key', g.id, 'text', g.term, 'image_url', g.image_url) order by md5(a.game_salt || g.id::text)) from jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean)));
  end if;

  -- Progreso: qué palabras ya se resolvieron (la respuesta correcta solo se muestra si ya la encontró,
  -- o si se agotaron sus intentos y el docente activó la retroalimentación inmediata)
  select coalesce(jsonb_object_agg(an.question_id, jsonb_strip_nulls(jsonb_build_object(
           'done', coalesce((an.response ->> 'done')::boolean, false),
           'correct', an.is_correct, 'tries', (an.response ->> 'tries')::int, 'partial', an.partial_score,
           'value', case when an.is_correct then an.response -> 'value' end,
           'cells', an.response -> 'cells',
           'wrong', (an.response ->> 'wrong')::int,
           'pair', case when an.is_correct and v_type = 'memory' then
                     jsonb_build_array(public._gkey(a.game_salt, an.question_id, 't'), public._gkey(a.game_salt, an.question_id, 'd')) end,
           'answer', case when coalesce((an.response ->> 'done')::boolean, false) and (an.is_correct or v_reveal) then
                       case when v_type = 'classify' then to_jsonb(g.grp)
                            when v_type = 'matching' then to_jsonb(public._gkey(a.game_salt, an.question_id, 'd'))
                            when v_type in ('crossword', 'wordsearch', 'anagram', 'hangman', 'rosco') then to_jsonb(public._game_norm(g.term))
                            else to_jsonb(g.term) end end))), '{}'::jsonb)
    into v_progress
    from public.answers an join jsonb_to_recordset(v_items) as g(id uuid, pos int, ord int, term text, prompt text, image_url text, grp text, contains boolean) on g.id = an.question_id
   where an.attempt_id = a.id;

  return jsonb_build_object('type', v_type, 'instructions', v_act ->> 'instructions', 'tries', public._activity_tries(v_act),
                            'total', jsonb_array_length(v_items), 'reveal', v_reveal,
                            'board', v_board, 'progress', v_progress,
                            'errors', coalesce((a.game_state ->> 'errors')::int, 0));
end $$;

create or replace function public.activity_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st jsonb := public.exam_state(p_token);
  v_cur uuid;
  v_last public.attempts;
  v_type text;
  v_open_reveal boolean;
begin
  if not coalesce((st ->> 'ok')::boolean, false) then return st; end if;
  v_cur := nullif(st -> 'current' ->> 'id', '')::uuid;
  select public._activity_type(s.quiz_id) into v_type
    from public.participants p join public.sessions s on s.id = p.session_id where p.token = p_token;
  st := st || jsonb_build_object('activity_type', v_type);
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

create or replace function public.activity_play(p_token uuid, p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.participants;
  s public.sessions;
  a public.attempts;
  v_act jsonb;
  v_type text;
  v_item uuid;
  v_term text;
  v_grp text;
  v_val text := btrim(coalesce(p_data ->> 'value', ''));
  v_ok boolean := false;
  v_prev public.answers;
  v_tries int;
  v_max int;
  v_done boolean;
  v_partial numeric := 0;
  v_deadline timestamptz;
  v_ms int;
  v_reveal boolean;
  v_ka uuid; v_kb uuid; v_sa text; v_sb text;
  v_letters text[];
  v_letter text;
  v_wrong int;
  v_mask text;
  v_miss int;
  v_resp jsonb;
  v_gs jsonb;
begin
  select * into p from public.participants where token = p_token;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p.kicked then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  select * into s from public.sessions where id = p.session_id;
  select * into a from public.attempts where participant_id = p.id and submitted_at is null for update;
  if a.id is null then return jsonb_build_object('ok', false, 'error', 'no_attempt'); end if;
  if a.locked then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  v_deadline := public._attempt_deadline(a.id);
  if v_deadline is not null and now() > v_deadline + interval '10 seconds' then
    perform public._finalize_expired(s.id);
    return jsonb_build_object('ok', false, 'error', 'time');
  end if;
  if public._activity_type(s.quiz_id) = 'research' then
    if p_action <> 'save' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
    v_item := nullif(p_data ->> 'item', '')::uuid;
    if v_item is null or not (v_item = any (a.question_ids)) then return jsonb_build_object('ok', false, 'error', 'item'); end if;
    v_val := left(btrim(coalesce(p_data ->> 'value', '')), 6000);
    insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
    values (p.teacher_id, s.id, p.id, v_item, a.id, jsonb_build_object('kind', 'research', 'value', v_val, 'done', v_val <> ''), null, 0, null, 0)
    on conflict (attempt_id, question_id) where attempt_id is not null
      do update set response = excluded.response, answered_at = now();
    update public.participants set last_ping = now(), connected = true where id = p.id;
    return jsonb_build_object('ok', true, 'item', v_item, 'saved', true, 'done', v_val <> '');
  end if;
  if pg_column_size(p_data) > 4000 or char_length(v_val) > 300 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  select settings -> 'activity' into v_act from public.quizzes where id = s.quiz_id;
  v_type := v_act ->> 'type';
  if v_type is null then return jsonb_build_object('ok', false, 'error', 'mode'); end if;
  v_max := public._activity_tries(v_act);
  v_reveal := public._window(s) = 'closed';  -- anti-trampa: las respuestas correctas se ven recién al cerrar la actividad
  v_ms := least(2000000000, greatest(0, (extract(epoch from (now() - a.started_at)) * 1000)))::int;
  update public.participants set last_ping = now(), connected = true where id = p.id;

  -- ---------------------------------------------------------- sopa de letras: buscar la palabra marcada
  if p_action = 'find' then
    if v_type <> 'wordsearch' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
    v_sa := replace(public._game_norm(v_val), ' ', '');
    select q.id, q.term into v_item, v_term
      from unnest(a.question_ids) qid join public.questions q on q.id = qid
     where v_sa <> '' and (replace(public._game_norm(q.term), ' ', '') = v_sa or reverse(replace(public._game_norm(q.term), ' ', '')) = v_sa)
       and not exists (select 1 from public.answers an where an.attempt_id = a.id and an.question_id = q.id)
     limit 1;
    if v_item is null then
      update public.attempts set game_state = jsonb_set(game_state, '{errors}', to_jsonb(coalesce((game_state ->> 'errors')::int, 0) + 1)) where id = a.id;
      return jsonb_build_object('ok', true, 'correct', false);
    end if;
    insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
    values (p.teacher_id, s.id, p.id, v_item, a.id,
            jsonb_build_object('kind', 'game', 'value', public._game_norm(v_term), 'cells', p_data -> 'cells', 'tries', 1, 'done', true),
            true, 1, v_ms, 1000)
    on conflict (attempt_id, question_id) where attempt_id is not null do nothing;
    return jsonb_build_object('ok', true, 'correct', true, 'item', v_item, 'value', public._game_norm(v_term), 'points', 1000);
  end if;

  -- ---------------------------------------------------------- memoria: ¿las dos cartas son pareja?
  if p_action = 'pair' then
    if v_type <> 'memory' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
    select qid, 't' into v_ka, v_sa from unnest(a.question_ids) qid where public._gkey(a.game_salt, qid, 't') = p_data ->> 'a';
    if v_ka is null then select qid, 'd' into v_ka, v_sa from unnest(a.question_ids) qid where public._gkey(a.game_salt, qid, 'd') = p_data ->> 'a'; end if;
    select qid, 't' into v_kb, v_sb from unnest(a.question_ids) qid where public._gkey(a.game_salt, qid, 't') = p_data ->> 'b';
    if v_kb is null then select qid, 'd' into v_kb, v_sb from unnest(a.question_ids) qid where public._gkey(a.game_salt, qid, 'd') = p_data ->> 'b'; end if;
    if v_ka is null or v_kb is null or (v_ka = v_kb and v_sa = v_sb) then return jsonb_build_object('ok', false, 'error', 'cards'); end if;
    if v_ka = v_kb then
      v_miss := coalesce((a.game_state -> 'miss' ->> v_ka::text)::int, 0);
      v_partial := greatest(0.5, 1 - 0.1 * greatest(0, v_miss - 1));
      insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
      values (p.teacher_id, s.id, p.id, v_ka, a.id, jsonb_build_object('kind', 'game', 'value', 'pareja', 'tries', v_miss + 1, 'done', true),
              true, v_partial, v_ms, round(1000 * v_partial))
      on conflict (attempt_id, question_id) where attempt_id is not null do nothing;
      return jsonb_build_object('ok', true, 'correct', true, 'item', v_ka, 'points', round(1000 * v_partial));
    end if;
    v_gs := jsonb_set(a.game_state, '{errors}', to_jsonb(coalesce((a.game_state ->> 'errors')::int, 0) + 1));
    v_gs := v_gs || jsonb_build_object('miss', coalesce(v_gs -> 'miss', '{}'::jsonb)
              || jsonb_build_object(v_ka::text, coalesce((v_gs -> 'miss' ->> v_ka::text)::int, 0) + 1));
    v_gs := v_gs || jsonb_build_object('miss', (v_gs -> 'miss')
              || jsonb_build_object(v_kb::text, coalesce((v_gs -> 'miss' ->> v_kb::text)::int, 0) + 1));
    update public.attempts set game_state = v_gs where id = a.id;
    return jsonb_build_object('ok', true, 'correct', false);
  end if;

  -- El resto de las jugadas se refieren a una palabra concreta del intento
  v_item := nullif(p_data ->> 'item', '')::uuid;
  if v_item is null or not (v_item = any (a.question_ids)) then return jsonb_build_object('ok', false, 'error', 'item'); end if;
  select term, case when tags[1] = 'contiene' then null else tags[1] end into v_term, v_grp from public.questions where id = v_item;
  select * into v_prev from public.answers where attempt_id = a.id and question_id = v_item for update;
  if v_prev.id is not null and coalesce((v_prev.response ->> 'done')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'already');
  end if;

  -- ---------------------------------------------------------- ahorcado: una letra
  if p_action = 'letter' then
    if v_type <> 'hangman' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
    v_letter := left(public._game_norm(p_data ->> 'letter'), 1);
    if v_letter is null or v_letter !~ '^[A-ZÑ0-9]$' then return jsonb_build_object('ok', false, 'error', 'letter'); end if;
    v_letters := coalesce(array(select jsonb_array_elements_text(v_prev.response -> 'letters')), '{}');
    v_wrong := coalesce((v_prev.response ->> 'wrong')::int, 0);
    if not (v_letter = any (v_letters)) then
      v_letters := v_letters || v_letter;
      if position(v_letter in public._game_norm(v_term)) = 0 then v_wrong := v_wrong + 1; end if;
    end if;
    v_mask := public._hangman_mask(v_term, v_letters);
    v_ok := position('_' in v_mask) = 0;
    v_done := v_ok or v_wrong >= 6;
    v_partial := case when v_ok then greatest(0.4, 1 - 0.1 * v_wrong) else 0 end;
    v_resp := jsonb_build_object('kind', 'game', 'letters', to_jsonb(v_letters), 'wrong', v_wrong, 'done', v_done,
                                 'tries', v_wrong, 'value', case when v_done then v_mask end);
    insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
    values (p.teacher_id, s.id, p.id, v_item, a.id, v_resp, v_ok, v_partial, v_ms, round(1000 * v_partial))
    on conflict (attempt_id, question_id) where attempt_id is not null do update
       set response = excluded.response, is_correct = excluded.is_correct, partial_score = excluded.partial_score,
           time_ms = excluded.time_ms, game_points = excluded.game_points, answered_at = now();
    return jsonb_strip_nulls(jsonb_build_object('ok', true, 'item', v_item, 'mask', v_mask, 'hit', position(v_letter in public._game_norm(v_term)) > 0,
             'wrong', v_wrong, 'done', v_done, 'correct', v_ok, 'points', round(1000 * v_partial),
             'answer', case when v_done and not v_ok and v_reveal then public._game_norm(v_term) end));
  end if;

  if p_action <> 'answer' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
  if v_type in ('wordsearch', 'memory', 'hangman') then return jsonb_build_object('ok', false, 'error', 'action'); end if;

  -- ---------------------------------------------------------- respuesta a una palabra
  v_ok := case
    when v_val = '' then false
    when v_type in ('crossword', 'anagram') then replace(public._game_norm(v_val), ' ', '') = replace(public._game_norm(v_term), ' ', '')
    when v_type in ('rosco', 'fill_text') then public.normalize_answer(v_val) = public.normalize_answer(v_term)
    when v_type = 'sentence' then public._game_norm(v_val) = public._game_norm(v_term)
    when v_type = 'classify' then public.normalize_answer(v_val) = public.normalize_answer(v_grp)
    when v_type = 'matching' then v_val = public._gkey(a.game_salt, v_item, 'd')
    else false end;
  v_tries := coalesce((v_prev.response ->> 'tries')::int, 0) + 1;
  v_done := v_ok or v_tries >= v_max;
  v_partial := case when v_ok then public._try_partial(v_tries) else 0 end;
  v_resp := jsonb_build_object('kind', 'game', 'value', v_val, 'tries', v_tries, 'done', v_done);
  if v_type = 'matching' then
    v_resp := v_resp || jsonb_build_object('value', coalesce((select q.prompt from unnest(a.question_ids) qid join public.questions q on q.id = qid
                                                              where public._gkey(a.game_salt, qid, 'd') = v_val), ''), 'key', v_val);
  end if;
  insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
  values (p.teacher_id, s.id, p.id, v_item, a.id, v_resp, v_ok, v_partial, v_ms, round(1000 * v_partial))
  on conflict (attempt_id, question_id) where attempt_id is not null do update
     set response = excluded.response, is_correct = excluded.is_correct, partial_score = excluded.partial_score,
         time_ms = excluded.time_ms, game_points = excluded.game_points, answered_at = now();
  if not v_ok and v_type in ('matching', 'memory', 'classify') then
    update public.attempts set game_state = jsonb_set(game_state, '{errors}', to_jsonb(coalesce((game_state ->> 'errors')::int, 0) + 1)) where id = a.id;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'item', v_item, 'correct', v_ok, 'done', v_done, 'tries', v_tries,
           'tries_left', greatest(0, v_max - v_tries), 'points', round(1000 * v_partial),
           'answer', case when v_done and not v_ok and v_reveal then
                       case when v_type = 'classify' then to_jsonb(v_grp)
                            when v_type = 'matching' then to_jsonb(public._gkey(a.game_salt, v_item, 'd'))
                            when v_type in ('crossword', 'anagram', 'rosco') then to_jsonb(public._game_norm(v_term))
                            else to_jsonb(v_term) end end));
end $$;

create or replace function public._finalize_attempt(p_attempt uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.attempts;
  v_w numeric; v_got numeric; v_n int; v_avg numeric; v_correct int; v_score int; v_grade numeric;
begin
  select * into a from public.attempts where id = p_attempt for update;
  if a.id is null or a.submitted_at is not null then return; end if;
  select coalesce(sum(case when q.base_points > 0 then q.base_points / 1000.0 else 0 end), 0),
         coalesce(sum(case when q.base_points > 0 then q.base_points / 1000.0 else 0 end * coalesce(an.partial_score, 0)), 0),
         count(*), coalesce(avg(coalesce(an.partial_score, 0)), 0),
         count(*) filter (where an.is_correct),
         coalesce(sum(an.game_points), 0)
    into v_w, v_got, v_n, v_avg, v_correct, v_score
    from unnest(a.question_ids) as qid
    join public.questions q on q.id = qid
    left join public.answers an on an.attempt_id = a.id and an.question_id = qid;
  v_grade := case when v_w > 0 then round(100 * v_got / v_w, 2) when v_n > 0 then round(100 * v_avg, 2) else 0 end;
  if public._activity_type((select quiz_id from public.sessions where id = a.session_id)) = 'research' then v_grade := null; end if;
  update public.attempts
     set submitted_at = now(), submit_reason = p_reason, grade = v_grade, correct_count = v_correct, score = v_score
   where id = a.id;
  -- El participante queda con su MEJOR intento (para ranking y reportes)
  update public.participants p
     set total_score = coalesce(x.g, 0), correct_count = coalesce(x.c, 0)
    from (select round(grade)::int as g, correct_count as c from public.attempts
           where participant_id = a.participant_id and submitted_at is not null
           order by grade desc nulls last, submitted_at limit 1) x
   where p.id = a.participant_id;
end $$;

create or replace function public.save_activity(p_quiz uuid, p_activity jsonb, p_items jsonb)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  it jsonb;
  i int := 0;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_type text := p_activity ->> 'type';
begin
  if not public.is_teacher() then raise exception 'Solo un docente aprobado puede editar actividades'; end if;
  if not public.owns('quizzes', p_quiz) then raise exception 'La actividad no existe o no es tuya'; end if;
  if v_type not in ('crossword', 'wordsearch', 'matching', 'memory', 'fill_text', 'rosco', 'anagram', 'sentence', 'hangman', 'classify', 'research') then
    raise exception 'Tipo de actividad no válido';
  end if;
  if exists (select 1 from public.questions where quiz_id = p_quiz and type <> 'game_item') then
    raise exception 'Esta evaluación tiene preguntas normales; cree una actividad nueva';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 60 then raise exception 'Máximo 60 palabras por actividad'; end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if btrim(coalesce(it ->> 'term', '')) = '' then raise exception 'La fila % no tiene palabra/respuesta', i + 1; end if;
    v_id := nullif(it ->> 'id', '')::uuid;
    if v_id is not null then
      update public.questions
         set sort_order = i, term = btrim(it ->> 'term'), prompt = coalesce(btrim(it ->> 'prompt'), ''),
             image_url = nullif(it ->> 'image_url', ''),
             tags = array_remove(array[nullif(btrim(it ->> 'group'), ''), case when (it ->> 'contains')::boolean then 'contiene' end], null),
             updated_at = now()
       where id = v_id and quiz_id = p_quiz and type = 'game_item';
      if not found then v_id := null; end if;
    end if;
    if v_id is null then
      insert into public.questions (quiz_id, sort_order, type, term, prompt, image_url, tags, base_points, time_limit_sec)
      values (p_quiz, i, 'game_item', btrim(it ->> 'term'), coalesce(btrim(it ->> 'prompt'), ''), nullif(it ->> 'image_url', ''),
              array_remove(array[nullif(btrim(it ->> 'group'), ''), case when (it ->> 'contains')::boolean then 'contiene' end], null),
              1000, 20)
      returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
    i := i + 1;
  end loop;

  delete from public.questions where quiz_id = p_quiz and type = 'game_item' and not (id = any (v_keep));
  update public.quizzes
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('activity', p_activity), updated_at = now()
   where id = p_quiz;
  return i;
end $$;

create or replace function public._activity_session_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text := public._activity_type(new.quiz_id);
begin
  if v_type is null then return new; end if;
  if new.mode = 'live' then raise exception 'Las actividades se aplican como tarea o examen (no en vivo)'; end if;
  if v_type in ('crossword', 'wordsearch', 'fill_text', 'research') then
    new.pick_count := null;
    new.shuffle_questions := false;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Investigaciones: lista para calificar y calificación del docente
-- ---------------------------------------------------------------------
create or replace function public.research_list(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.sessions; v_act jsonb;
begin
  select * into s from public.sessions where id = p_session and teacher_id = auth.uid();
  if s.id is null then raise exception 'La sesión no existe o no es suya'; end if;
  select settings -> 'activity' into v_act from public.quizzes where id = s.quiz_id;
  return jsonb_build_object(
    'criteria', coalesce(v_act -> 'criteria', '[]'::jsonb),
    'min_words', coalesce((v_act ->> 'min_words')::int, 40),
    'items', coalesce((select jsonb_agg(x order by x ->> 'name') from (
      select jsonb_build_object(
        'attempt', a.id, 'number', a.number, 'submitted_at', a.submitted_at, 'grade', a.grade,
        'name', coalesce(st.last_names || ' ' || st.first_names, p.nickname), 'ru', st.university_code,
        'case', v_act -> 'variants' -> a.variant -> 'case',
        'focus_losses', a.focus_losses, 'paste', a.paste_count,
        'scores', a.game_state -> 'rubric' -> 'scores', 'comment', a.game_state -> 'rubric' ->> 'comment',
        'answers', (select jsonb_agg(jsonb_build_object('question', q.term, 'text', coalesce(an.response ->> 'value', '')) order by t.o)
                      from unnest(a.question_ids) with ordinality as t(qid, o)
                      join public.questions q on q.id = t.qid
                      left join public.answers an on an.attempt_id = a.id and an.question_id = t.qid)) x
        from public.attempts a
        join public.participants p on p.id = a.participant_id
        left join public.students st on st.id = p.student_id
       where a.session_id = s.id and a.submitted_at is not null) y), '[]'::jsonb));
end $$;

create or replace function public.research_grade(p_attempt uuid, p_scores int[], p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.attempts; s public.sessions; v_act jsonb; v_n int; v_grade numeric; v_student uuid;
begin
  select * into a from public.attempts where id = p_attempt and teacher_id = auth.uid() for update;
  if a.id is null then raise exception 'La entrega no existe o no es suya'; end if;
  if a.submitted_at is null then raise exception 'El estudiante todavía no entregó'; end if;
  select * into s from public.sessions where id = a.session_id;
  select settings -> 'activity' into v_act from public.quizzes where id = s.quiz_id;
  v_n := greatest(1, coalesce(jsonb_array_length(v_act -> 'criteria'), 0));
  if p_scores is null then
    v_grade := null;
  else
    if coalesce(array_length(p_scores, 1), 0) <> v_n or exists (select 1 from unnest(p_scores) x where x is null or x not in (0, 1, 2)) then
      raise exception 'Marque los % criterios (Cumple, A medias o No cumple)', v_n;
    end if;
    v_grade := round(100.0 * (select sum(x) from unnest(p_scores) x) / (v_n * 2), 2);
  end if;
  update public.attempts
     set grade = v_grade,
         game_state = coalesce(game_state, '{}'::jsonb) || jsonb_build_object('rubric', case when p_scores is null then null else
                        jsonb_build_object('scores', to_jsonb(p_scores), 'comment', nullif(btrim(coalesce(p_comment, '')), ''), 'at', now()) end)
   where id = a.id;
  update public.participants p
     set total_score = coalesce(x.g, 0), correct_count = coalesce(x.c, 0)
    from (select round(grade)::int as g, correct_count as c from public.attempts
           where participant_id = a.participant_id and submitted_at is not null
           order by grade desc nulls last, submitted_at limit 1) x
   where p.id = a.participant_id;
  -- correo con la nota (si están activados y el estudiante tiene correo)
  if v_grade is not null and coalesce((select mail_enabled from public.teacher_settings where teacher_id = s.teacher_id), false) then
    select p.student_id into v_student from public.participants p where p.id = a.participant_id;
    if v_student is not null and exists (select 1 from public.students where id = v_student and email is not null) then
      insert into public.mail_outbox (teacher_id, student_id, kind, ref_id, not_before)
      values (s.teacher_id, v_student, 'grade', a.id, now())
      on conflict (kind, ref_id, student_id) do update set sent_at = null, claimed_at = null, tries = 0, error = null, not_before = now();
    end if;
  end if;
  return jsonb_build_object('ok', true, 'grade', v_grade);
end $$;

revoke all on function public.research_list(uuid) from public, anon;
grant execute on function public.research_list(uuid) to authenticated;
revoke all on function public.research_grade(uuid, integer[], text) from public, anon;
grant execute on function public.research_grade(uuid, integer[], text) to authenticated;

notify pgrst, 'reload schema';
