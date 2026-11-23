-- 0026 · Respuestas escritas más justas:
--   * extra.alt = otras respuestas válidas (sinónimos, plural, sigla en inglés) en Adivinanza, Rosco, Completar,
--     Dictado de conceptos y Mapa (escribir)
--   * en los cálculos se aceptan «4,0», «4.0», «Bs 15», «15 %» o «1.800» si el número es el correcto

create or replace function public._num_of(t text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare s text := lower(btrim(coalesce(t, '')));
begin
  s := regexp_replace(s, '^(bs\.?|bs)\s*', '');
  s := regexp_replace(s, '\s*(bs\.?|%|bolivianos?|veces)$', '');
  s := replace(s, ' ', '');
  if s ~ '^-?\d{1,3}(\.\d{3})+$' then s := replace(s, '.', ''); end if;   -- 1.800 → 1800 (miles)
  if s ~ '^-?\d{1,3}(,\d{3})+$' and s !~ ',\d{1,2}$' then s := replace(s, ',', ''); end if;
  s := replace(s, ',', '.');
  if s ~ '^-?\d+(\.\d+)?$' then return s::numeric; end if;
  return null;
exception when others then return null;
end $$;

create or replace function public._typed_match(p_val text, p_term text, p_alt jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select public.normalize_answer(p_val) = public.normalize_answer(p_term)
      or exists (select 1 from jsonb_array_elements_text(coalesce(p_alt, '[]'::jsonb)) x
                  where btrim(x) <> '' and public.normalize_answer(p_val) = public.normalize_answer(x))
      or (public._num_of(p_term) is not null and public._num_of(p_val) = public._num_of(p_term));
$$;

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
  v_alt jsonb;
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
  if pg_column_size(p_data) > 4000 or char_length(v_val) > 1000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
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
  select term, case when tags[1] = 'contiene' then null else tags[1] end, coalesce(extra -> 'alt', '[]'::jsonb) into v_term, v_grp, v_alt from public.questions where id = v_item;
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

  -- ---------------------------------------------------------- adivinanza: pedir otra pista
  if p_action = 'clue' then
    if v_type <> 'riddle' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
    select coalesce(q.extra -> 'clues', '[]'::jsonb) into v_gs from public.questions q where q.id = v_item;
    v_miss := least(greatest(1, jsonb_array_length(v_gs)), coalesce((v_prev.response ->> 'clues')::int, 1) + 1);
    v_resp := coalesce(v_prev.response, jsonb_build_object('kind', 'game', 'tries', 0, 'done', false)) || jsonb_build_object('clues', v_miss);
    insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
    values (p.teacher_id, s.id, p.id, v_item, a.id, v_resp, false, 0, v_ms, 0)
    on conflict (attempt_id, question_id) where attempt_id is not null do update set response = excluded.response, answered_at = now();
    return jsonb_build_object('ok', true, 'item', v_item, 'clues', v_miss, 'clue', v_gs ->> (v_miss - 1));
  end if;

  -- ---------------------------------------------------------- presentación: diapositiva vista
  if p_action = 'seen' then
    if v_type <> 'slides' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
    insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
    values (p.teacher_id, s.id, p.id, v_item, a.id, jsonb_build_object('kind', 'game', 'value', 'vista', 'tries', 1, 'done', true), true, 1, v_ms, 1000);
    return jsonb_build_object('ok', true, 'item', v_item, 'correct', true, 'done', true, 'points', 1000);
  end if;

  if p_action <> 'answer' then return jsonb_build_object('ok', false, 'error', 'action'); end if;
  if v_type in ('wordsearch', 'memory', 'hangman', 'slides') then return jsonb_build_object('ok', false, 'error', 'action'); end if;

  -- ---------------------------------------------------------- respuesta a una palabra
  v_ok := case
    when v_val = '' then false
    when v_type in ('crossword', 'anagram') then replace(public._game_norm(v_val), ' ', '') = replace(public._game_norm(v_term), ' ', '')
    when v_type in ('rosco', 'fill_text') then public._typed_match(v_val, v_term, v_alt)
    when v_type = 'sentence' then public._game_norm(v_val) = public._game_norm(v_term)
    when v_type = 'classify' then public.normalize_answer(v_val) = public.normalize_answer(v_grp)
    when v_type = 'matching' then v_val = public._gkey(a.game_salt, v_item, 'd')
    when v_type in ('froggy', 'asterquiz', 'puzzle', 'video', 'dialogue') then public.normalize_answer(v_val) = public.normalize_answer(v_term)
    when v_type = 'riddle' then public._typed_match(v_val, v_term, v_alt)
    when v_type = 'yesno' then public.normalize_answer(v_val) = public.normalize_answer(v_grp)
    when v_type = 'rows' then public.normalize_answer(regexp_replace(v_val, '\s*\|\s*', ' | ', 'g')) = public.normalize_answer(regexp_replace(v_term, '\s*\|\s*', ' | ', 'g'))
    when v_type = 'map' then
      case when coalesce(v_act ->> 'map_mode', 'tap') = 'tap' then v_val = public._gkey(a.game_salt, v_item, 'p')
           else public._typed_match(v_val, v_term, v_alt) end
    when v_type = 'dictation' then
      case when coalesce((v_act ->> 'accents')::boolean, coalesce(v_act ->> 'listen', 'term') <> 'prompt')
           then public._dict_norm(v_val) = public._dict_norm(v_term)
           else public._typed_match(v_val, v_term, v_alt) end
    else false end;
  v_tries := coalesce((v_prev.response ->> 'tries')::int, 0) + 1;
  v_done := v_ok or v_tries >= v_max;
  v_partial := case when v_ok then public._try_partial(v_tries) else 0 end;
  v_resp := jsonb_build_object('kind', 'game', 'value', v_val, 'tries', v_tries, 'done', v_done);
  if v_type = 'riddle' then
    -- cada pista extra y cada intento fallido restan 20 % (mínimo 20 %)
    v_miss := coalesce((v_prev.response ->> 'clues')::int, 1);
    v_partial := case when v_ok then greatest(0.2, 1 - 0.2 * (v_miss - 1) - 0.2 * (v_tries - 1)) else 0 end;
    v_resp := v_resp || jsonb_build_object('clues', v_miss);
  elsif v_type = 'map' and coalesce(v_act ->> 'map_mode', 'tap') = 'tap' then
    v_resp := v_resp || jsonb_build_object('key', v_val, 'value', coalesce((select q.term from unnest(a.question_ids) qid join public.questions q on q.id = qid
                                                                             where public._gkey(a.game_salt, qid, 'p') = v_val), ''));
  end if;
  if v_type = 'matching' then
    v_resp := v_resp || jsonb_build_object('value', coalesce((select q.prompt from unnest(a.question_ids) qid join public.questions q on q.id = qid
                                                              where public._gkey(a.game_salt, qid, 'd') = v_val), ''), 'key', v_val);
  end if;
  insert into public.answers (teacher_id, session_id, participant_id, question_id, attempt_id, response, is_correct, partial_score, time_ms, game_points)
  values (p.teacher_id, s.id, p.id, v_item, a.id, v_resp, v_ok, v_partial, v_ms, round(1000 * v_partial))
  on conflict (attempt_id, question_id) where attempt_id is not null do update
     set response = excluded.response, is_correct = excluded.is_correct, partial_score = excluded.partial_score,
         time_ms = excluded.time_ms, game_points = excluded.game_points, answered_at = now();
  if not v_ok and v_type in ('matching', 'memory', 'classify', 'map') then
    update public.attempts set game_state = jsonb_set(game_state, '{errors}', to_jsonb(coalesce((game_state ->> 'errors')::int, 0) + 1)) where id = a.id;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'item', v_item, 'correct', v_ok, 'done', v_done, 'tries', v_tries,
           'tries_left', greatest(0, v_max - v_tries), 'points', round(1000 * v_partial),
           'near', case when not v_ok and v_type = 'dictation' and public.normalize_answer(v_val) = public.normalize_answer(v_term) then true end,
           'answer', case when v_done and not v_ok and v_reveal then
                       case when v_type in ('classify', 'yesno') then to_jsonb(v_grp)
                            when v_type = 'map' and coalesce(v_act ->> 'map_mode', 'tap') = 'tap' then to_jsonb(public._gkey(a.game_salt, v_item, 'p'))
                            when v_type = 'matching' then to_jsonb(public._gkey(a.game_salt, v_item, 'd'))
                            when v_type in ('crossword', 'anagram', 'rosco') then to_jsonb(public._game_norm(v_term))
                            else to_jsonb(v_term) end end));
end $$;

