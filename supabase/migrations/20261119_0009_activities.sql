-- =====================================================================
-- YaguarQuiz UAP — Fase 9: actividades estilo Educaplay
--   Crucigrama, sopa de letras, relacionar columnas, memoria, completar texto, rosco,
--   ordenar letras, ordenar frase, adivina la palabra (ahorcado) y clasificar.
-- Una actividad es una evaluación (quizzes) con settings.activity = { type, ... } y una lista de
-- palabras guardadas como preguntas de tipo 'game_item':
--   term   = la respuesta (palabra, frase o término de la pareja)
--   prompt = pista / definición / pareja (texto) · image_url = imagen opcional de la pista
--   tags[1]= grupo (clasificar) · en el rosco 'contiene' si la palabra CONTIENE la letra
-- Se aplica como tarea o examen (intentos, fechas, nota, reportes y libreta funcionan igual).
-- Seguridad: el estudiante nunca recibe las respuestas; cada jugada se corrige en el servidor.
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Esquema
-- ---------------------------------------------------------------------
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check check (type in (
  'single', 'multiple', 'true_false', 'short_text', 'ordering', 'image_choice',
  'matching', 'fill_blank', 'numeric', 'poll', 'open', 'hotspot', 'word_cloud', 'game_item'));

-- Estado del juego por intento (errores de memoria y de la sopa de letras)
alter table public.attempts add column if not exists game_state jsonb not null default '{}'::jsonb;
-- Secreto por intento: las claves de cartas/definiciones no se pueden calcular desde el navegador
alter table public.attempts add column if not exists game_salt text not null default md5(random()::text || clock_timestamp()::text);

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
-- Texto de juego: MAYÚSCULAS sin tildes (conserva la Ñ), solo letras, números y espacios simples
create or replace function public._game_norm(t text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(
    translate(upper(coalesce(t, '')), 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÇáàäâãéèëêíìïîóòöôõúùüûçñ', 'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUCÑ'),
    '[^A-Z0-9Ñ ]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Tipo de actividad de una evaluación (null si es una evaluación normal)
create or replace function public._activity_type(p_quiz uuid)
returns text language sql stable security definer set search_path = '' as $$
  select settings -> 'activity' ->> 'type' from public.quizzes where id = p_quiz;
$$;

-- Intentos por palabra según el tipo (configurable en settings.activity.tries)
create or replace function public._activity_tries(p_act jsonb)
returns int language sql immutable set search_path = '' as $$
  select greatest(1, least(5, coalesce((p_act ->> 'tries')::int,
    case p_act ->> 'type' when 'rosco' then 1 when 'crossword' then 3 else 2 end)));
$$;

-- Puntaje parcial al acertar en el intento n (1.º = 100 %, 2.º = 60 %, 3.º o más = 30 %)
create or replace function public._try_partial(n int)
returns numeric language sql immutable set search_path = '' as $$
  select case when n <= 1 then 1 when n = 2 then 0.6 else 0.3 end::numeric;
$$;

-- Clave opaca (para que el navegador no sepa qué carta/definición corresponde a qué palabra)
create or replace function public._gkey(p_salt text, p_item uuid, p_side text)
returns text language sql immutable set search_path = '' as $$
  select substr(md5(p_salt || ':' || p_item::text || ':' || p_side), 1, 16);
$$;

-- Máscara del ahorcado: letras adivinadas visibles, el resto como "_"
create or replace function public._hangman_mask(p_term text, p_letters text[])
returns text language sql immutable set search_path = '' as $$
  select string_agg(case when c = ' ' then ' ' when c = any (coalesce(p_letters, '{}')) or c !~ '[A-ZÑ]' then c else '_' end, '' order by i)
    from unnest(string_to_array(public._game_norm(p_term), null)) with ordinality as t(c, i);
$$;

-- ---------------------------------------------------------------------
-- DOCENTE: guardar la actividad completa (configuración + palabras) en una sola operación
-- p_activity: { type, instructions?, tries?, show_words?, word_bank?, text?, layout?, grid? }
--   layout/grid/text se refieren a las palabras por su posición (0, 1, 2…), no por su id.
-- p_items: [{ id?, term, prompt, image_url?, group?, contains? }]
-- ---------------------------------------------------------------------
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
  if v_type not in ('crossword', 'wordsearch', 'matching', 'memory', 'fill_text', 'rosco', 'anagram', 'sentence', 'hangman', 'classify') then
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

-- Las actividades se aplican como tarea o examen; en las que tienen tablero fijo se usan todas las palabras
create or replace function public._activity_session_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text := public._activity_type(new.quiz_id);
begin
  if v_type is null then return new; end if;
  if new.mode = 'live' then raise exception 'Las actividades se aplican como tarea o examen (no en vivo)'; end if;
  if v_type in ('crossword', 'wordsearch', 'fill_text') then
    new.pick_count := null;
    new.shuffle_questions := false;
  end if;
  return new;
end $$;
drop trigger if exists activity_session_guard on public.sessions;
create trigger activity_session_guard before insert or update of mode, pick_count on public.sessions
  for each row execute function public._activity_session_guard();

-- ---------------------------------------------------------------------
-- Tablero que ve el estudiante (SIN respuestas) + su progreso
-- ---------------------------------------------------------------------
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
  v_type := v_act ->> 'type';
  v_reveal := s.show_correct = 'each';

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

-- ---------------------------------------------------------------------
-- ESTUDIANTE: estado completo (examen/tarea + tablero de la actividad + revisión al final)
-- ---------------------------------------------------------------------
create or replace function public.activity_state(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st jsonb := public.exam_state(p_token);
  v_cur uuid;
  v_last public.attempts;
  v_type text;
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
  if st -> 'review' is not null and jsonb_typeof(st -> 'review') = 'array' then
    select a.* into v_last from public.attempts a join public.participants p on p.id = a.participant_id
     where p.token = p_token and a.submitted_at is not null order by a.number desc limit 1;
    st := st || jsonb_build_object('review', (
      select jsonb_agg(jsonb_build_object(
               'clue', case when q.prompt = '' then null else q.prompt end, 'image_url', q.image_url,
               'answer', case when v_type = 'classify' then q.term || ' → ' || coalesce(q.tags[1], '') else q.term end,
               'response', coalesce(an.response ->> 'value', ''),
               'correct', coalesce(an.is_correct, false), 'partial', coalesce(an.partial_score, 0)) order by t.ord)
        from unnest(v_last.question_ids) with ordinality as t(qid, ord)
        join public.questions q on q.id = t.qid
        left join public.answers an on an.attempt_id = v_last.id and an.question_id = t.qid));
  end if;
  return st;
end $$;

-- ---------------------------------------------------------------------
-- ESTUDIANTE: una jugada. Corrige en el servidor y guarda el avance.
-- p_action: 'answer' {item, value} · 'find' {value, cells} (sopa) · 'pair' {a, b} (memoria) · 'letter' {item, letter}
-- ---------------------------------------------------------------------
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
  if pg_column_size(p_data) > 4000 or char_length(v_val) > 300 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  select settings -> 'activity' into v_act from public.quizzes where id = s.quiz_id;
  v_type := v_act ->> 'type';
  if v_type is null then return jsonb_build_object('ok', false, 'error', 'mode'); end if;
  v_max := public._activity_tries(v_act);
  v_reveal := s.show_correct = 'each';
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

-- Información del PIN: agrega el tipo de actividad (para mostrarlo al entrar)
create or replace function public.session_info_activity(p_pin text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.session_info(p_pin) || coalesce((
    select jsonb_build_object('activity_type', public._activity_type(s.quiz_id))
      from public.sessions s where s.pin = btrim(p_pin) order by (s.status <> 'finished') desc, s.created_at desc limit 1), '{}'::jsonb);
$$;

-- Texto legible de una respuesta de juego (reportes y Google Sheets)
create or replace function public._response_text(p_question uuid, r jsonb)
returns text language sql stable security definer set search_path = '' as $$
  select case r ->> 'kind'
    when 'choice' then (select coalesce(nullif(o.text, ''), 'Imagen ' || o.sort_order + 1) from public.question_options o where o.id::text = r ->> 'key' and o.question_id = p_question)
    when 'choices' then (select string_agg(coalesce(nullif(o.text, ''), 'Imagen ' || o.sort_order + 1), ', ' order by o.sort_order)
                           from public.question_options o where o.question_id = p_question and r -> 'keys' ? o.id::text)
    when 'text' then r ->> 'text'
    when 'order' then (select string_agg(coalesce(nullif(o.text, ''), '?'), ' → ' order by k.ord)
                         from jsonb_array_elements_text(r -> 'keys') with ordinality as k(key, ord)
                         join public.question_options o on o.id::text = k.key and o.question_id = p_question)
    when 'game' then coalesce(r ->> 'value', '') || case when (r ->> 'tries')::int > 1 then ' (' || (r ->> 'tries') || ' intentos)' else '' end
  end;
$$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public._activity_type(uuid)', 'public._activity_board(uuid)', 'public._activity_session_guard()',
                           'public._gkey(text, uuid, text)', 'public._hangman_mask(text, text[])', 'public._activity_tries(jsonb)',
                           'public._try_partial(integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.save_activity(uuid, jsonb, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.activity_state(uuid)', 'public.activity_play(uuid, text, jsonb)', 'public.session_info_activity(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
