-- =====================================================================
-- YaguarQuiz UAP — Fase 3: editor de evaluaciones y banco de preguntas
-- Funciones transaccionales (respetan RLS: security invoker) para guardar,
-- importar, ordenar, copiar, mover y duplicar preguntas/evaluaciones.
-- Almacenamiento de imágenes en el bucket público "media".
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Guarda UNA pregunta con sus opciones (crea o actualiza).
-- p: { id?, quiz_id, sort_order?, type, prompt, image_url, video_url, time_limit_sec,
--      base_points, difficulty, explanation, tags[], accepted_answers[],
--      numeric_answer, numeric_tolerance, term, definition,
--      options: [{ id?, text, image_url, is_correct, sort_order, match_pair, correct_position }] }
-- Devuelve { id, options: [{ id, sort_order }] }
-- ---------------------------------------------------------------------
create or replace function public._save_question(p jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_quiz uuid := (p ->> 'quiz_id')::uuid;
  v_order int;
  v_keep uuid[] := '{}';
  v_opt uuid;
  o jsonb;
  i int := 0;
  v_out jsonb := '[]'::jsonb;
begin
  if not public.owns('quizzes', v_quiz) then
    raise exception 'La evaluación no existe o no es tuya';
  end if;

  if v_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_order from public.questions where quiz_id = v_quiz;
    insert into public.questions (quiz_id, sort_order, type, prompt, image_url, video_url, time_limit_sec,
                                  base_points, difficulty, explanation, tags, accepted_answers,
                                  numeric_answer, numeric_tolerance, term, definition)
    values (
      v_quiz,
      coalesce((p ->> 'sort_order')::int, v_order),
      p ->> 'type',
      coalesce(p ->> 'prompt', ''),
      nullif(p ->> 'image_url', ''),
      nullif(p ->> 'video_url', ''),
      coalesce((p ->> 'time_limit_sec')::int, 20),
      coalesce((p ->> 'base_points')::int, 1000),
      nullif(p ->> 'difficulty', ''),
      nullif(p ->> 'explanation', ''),
      coalesce(array(select jsonb_array_elements_text(p -> 'tags')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p -> 'accepted_answers')), '{}'),
      (p ->> 'numeric_answer')::numeric,
      (p ->> 'numeric_tolerance')::numeric,
      nullif(p ->> 'term', ''),
      nullif(p ->> 'definition', '')
    )
    returning id into v_id;
  else
    update public.questions set
      type              = p ->> 'type',
      prompt            = coalesce(p ->> 'prompt', ''),
      image_url         = nullif(p ->> 'image_url', ''),
      video_url         = nullif(p ->> 'video_url', ''),
      time_limit_sec    = coalesce((p ->> 'time_limit_sec')::int, 20),
      base_points       = coalesce((p ->> 'base_points')::int, 1000),
      difficulty        = nullif(p ->> 'difficulty', ''),
      explanation       = nullif(p ->> 'explanation', ''),
      tags              = coalesce(array(select jsonb_array_elements_text(p -> 'tags')), '{}'),
      accepted_answers  = coalesce(array(select jsonb_array_elements_text(p -> 'accepted_answers')), '{}'),
      numeric_answer    = (p ->> 'numeric_answer')::numeric,
      numeric_tolerance = (p ->> 'numeric_tolerance')::numeric,
      term              = nullif(p ->> 'term', ''),
      definition        = nullif(p ->> 'definition', '')
    where id = v_id and quiz_id = v_quiz;
    if not found then
      raise exception 'La pregunta no existe o no es tuya';
    end if;
  end if;

  for o in select * from jsonb_array_elements(coalesce(p -> 'options', '[]'::jsonb)) loop
    i := i + 1;
    v_opt := nullif(o ->> 'id', '')::uuid;
    if v_opt is not null then
      update public.question_options set
        text = coalesce(o ->> 'text', ''),
        image_url = nullif(o ->> 'image_url', ''),
        is_correct = coalesce((o ->> 'is_correct')::boolean, false),
        sort_order = i,
        match_pair = nullif(o ->> 'match_pair', ''),
        correct_position = (o ->> 'correct_position')::int
      where id = v_opt and question_id = v_id;
      if not found then v_opt := null; end if;
    end if;
    if v_opt is null then
      insert into public.question_options (question_id, text, image_url, is_correct, sort_order, match_pair, correct_position)
      values (v_id, coalesce(o ->> 'text', ''), nullif(o ->> 'image_url', ''),
              coalesce((o ->> 'is_correct')::boolean, false), i,
              nullif(o ->> 'match_pair', ''), (o ->> 'correct_position')::int)
      returning id into v_opt;
    end if;
    v_keep := v_keep || v_opt;
    v_out := v_out || jsonb_build_object('id', v_opt, 'sort_order', i);
  end loop;

  delete from public.question_options where question_id = v_id and not (id = any (v_keep));
  return jsonb_build_object('id', v_id, 'options', v_out);
end $$;

create or replace function public.save_question(p_question jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_teacher() then
    raise exception 'Solo un docente aprobado puede editar preguntas';
  end if;
  return public._save_question(p_question);
end $$;

-- Importación masiva (desde Excel): todo o nada.
create or replace function public.import_questions(p_quiz_id uuid, p_items jsonb)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  it jsonb;
  n int := 0;
begin
  if not public.is_teacher() then
    raise exception 'Solo un docente aprobado puede importar preguntas';
  end if;
  if not public.owns('quizzes', p_quiz_id) then
    raise exception 'La evaluación no existe o no es tuya';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    perform public._save_question((it - 'id') || jsonb_build_object('quiz_id', p_quiz_id));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Reordenar preguntas (arrastrar en el editor)
create or replace function public.reorder_questions(p_quiz_id uuid, p_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.owns('quizzes', p_quiz_id) then
    raise exception 'La evaluación no existe o no es tuya';
  end if;
  update public.questions q set sort_order = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where q.id = x.id and q.quiz_id = p_quiz_id;
end $$;

-- Copia profunda de preguntas (banco de preguntas / duplicar)
create or replace function public.copy_questions(p_ids uuid[], p_target_quiz uuid)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  q record;
  v_new uuid;
  v_order int;
  n int := 0;
begin
  if not public.is_teacher() then
    raise exception 'Solo un docente aprobado puede copiar preguntas';
  end if;
  if not public.owns('quizzes', p_target_quiz) then
    raise exception 'La evaluación destino no existe o no es tuya';
  end if;
  select coalesce(max(sort_order), 0) into v_order from public.questions where quiz_id = p_target_quiz;
  for q in
    select * from public.questions
     where id = any (p_ids)
     order by array_position(p_ids, id)
  loop
    v_order := v_order + 1;
    insert into public.questions (quiz_id, sort_order, type, prompt, image_url, video_url, time_limit_sec, base_points,
                                  difficulty, explanation, tags, accepted_answers, numeric_answer, numeric_tolerance, term, definition)
    values (p_target_quiz, v_order, q.type, q.prompt, q.image_url, q.video_url, q.time_limit_sec, q.base_points,
            q.difficulty, q.explanation, q.tags, q.accepted_answers, q.numeric_answer, q.numeric_tolerance, q.term, q.definition)
    returning id into v_new;
    insert into public.question_options (question_id, text, image_url, is_correct, sort_order, match_pair, correct_position)
    select v_new, text, image_url, is_correct, sort_order, match_pair, correct_position
      from public.question_options where question_id = q.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Mover preguntas a otra evaluación (se agregan al final)
create or replace function public.move_questions(p_ids uuid[], p_target_quiz uuid)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  v_order int;
  n int;
begin
  if not public.owns('quizzes', p_target_quiz) then
    raise exception 'La evaluación destino no existe o no es tuya';
  end if;
  select coalesce(max(sort_order), 0) into v_order from public.questions where quiz_id = p_target_quiz;
  update public.questions q set quiz_id = p_target_quiz, sort_order = v_order + x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where q.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Duplicar una evaluación completa (queda como borrador)
create or replace function public.duplicate_quiz(p_quiz_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  src record;
  v_new uuid;
  v_ids uuid[];
begin
  select * into src from public.quizzes where id = p_quiz_id;
  if src.id is null then
    raise exception 'La evaluación no existe o no es tuya';
  end if;
  insert into public.quizzes (subject_id, topic_id, title, description, cover_url, visual_theme, settings, status)
  values (src.subject_id, src.topic_id, src.title || ' (copia)', src.description, src.cover_url, src.visual_theme, src.settings, 'draft')
  returning id into v_new;
  select array_agg(id order by sort_order) into v_ids from public.questions where quiz_id = p_quiz_id;
  if v_ids is not null then
    perform public.copy_questions(v_ids, v_new);
  end if;
  return v_new;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public._save_question(jsonb)', 'public.save_question(jsonb)', 'public.import_questions(uuid, jsonb)',
    'public.reorder_questions(uuid, uuid[])', 'public.copy_questions(uuid[], uuid)',
    'public.move_questions(uuid[], uuid)', 'public.duplicate_quiz(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Búsqueda en el banco por texto
create index if not exists idx_questions_tags on public.questions using gin (tags);

-- ---------------------------------------------------------------------
-- Imágenes: bucket público "media". Cada docente sube solo en su carpeta
-- <su id>/..., las imágenes se ven por URL pública (las preguntas las muestran).
-- (Solo se ejecuta si el esquema storage existe: en Supabase siempre existe)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('media', 'media', true, 3145728, array['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists media_insert_own on storage.objects;
    drop policy if exists media_update_own on storage.objects;
    drop policy if exists media_delete_own on storage.objects;
    drop policy if exists media_select_own on storage.objects;

    create policy media_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_teacher()));
    create policy media_update_own on storage.objects for update to authenticated
      using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy media_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy media_select_own on storage.objects for select to authenticated
      using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
