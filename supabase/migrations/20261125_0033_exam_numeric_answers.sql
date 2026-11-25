-- 0033 · Examen y juego en vivo: en las preguntas de cálculo vale el número correcto escrito de cualquier forma
-- («4,0», «Bs. 20», «20 bolivianos», «3 veces», «Bs1.440», «4:1», «3x»), igual que en las actividades (0026).
-- Antes solo valían las formas exactas de la lista de respuestas aceptadas.

create or replace function public._num_of(t text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare s text := lower(btrim(coalesce(t, '')));
begin
  s := regexp_replace(s, '^(bs\.?|bs)\s*', '');
  s := regexp_replace(s, '\s*(bs\.?|%|bolivianos?|veces|:\s*1|a\s*1)$', '');
  s := regexp_replace(s, '^x\s*|\s*x$', '');                              -- «x3», «3x»
  s := replace(s, ' ', '');
  if s ~ '^-?\d{1,3}(\.\d{3})+$' then s := replace(s, '.', ''); end if;   -- 1.800 → 1800 (miles)
  if s ~ '^-?\d{1,3}(,\d{3})+$' and s !~ ',\d{1,2}$' then s := replace(s, ',', ''); end if;
  s := replace(s, ',', '.');
  if s ~ '^-?\d+(\.\d+)?$' then return s::numeric; end if;
  return null;
exception when others then return null;
end $$;

create or replace function public._grade(p_question uuid, p_response jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_type text;
  v_acc text[];
  v_kind text := p_response ->> 'kind';
  v_ncorrect int;
  v_hits int;
  v_wrong int;
  v_total int;
  v_inplace int;
  v_partial numeric := 0;
begin
  select q.type, q.accepted_answers into v_type, v_acc from public.questions q where q.id = p_question;
  if v_type in ('single', 'true_false', 'image_choice') then
    if v_kind = 'choice' and exists (
      select 1 from public.question_options o
       where o.question_id = p_question and o.id::text = p_response ->> 'key' and o.is_correct) then
      v_partial := 1;
    end if;
  elsif v_type = 'multiple' then
    if v_kind = 'choices' and jsonb_typeof(p_response -> 'keys') = 'array' then
      select count(*) into v_ncorrect from public.question_options o where o.question_id = p_question and o.is_correct;
      select count(*) filter (where o.is_correct), count(*) filter (where not o.is_correct)
        into v_hits, v_wrong
        from (select distinct jsonb_array_elements_text(p_response -> 'keys') as k) r
        join public.question_options o on o.id::text = r.k and o.question_id = p_question;
      if v_ncorrect > 0 then
        v_partial := greatest(0, (v_hits - v_wrong)::numeric / v_ncorrect);
      end if;
    end if;
  elsif v_type = 'short_text' then
    if v_kind = 'text' and public.normalize_answer(p_response ->> 'text') <> '' and exists (
      select 1 from unnest(v_acc) a
       where public.normalize_answer(a) = public.normalize_answer(p_response ->> 'text')
          -- cálculos: vale el número correcto escrito de cualquier forma («4,0», «Bs. 20», «3 veces», «Bs1.440», «4:1»)
          or (public._num_of(a) is not null and public._num_of(a) = public._num_of(p_response ->> 'text'))) then
      v_partial := 1;
    end if;
  elsif v_type = 'ordering' then
    if v_kind = 'order' and jsonb_typeof(p_response -> 'keys') = 'array' then
      select count(*) into v_total from public.question_options o where o.question_id = p_question;
      select count(*) into v_inplace
        from jsonb_array_elements_text(p_response -> 'keys') with ordinality as r(k, ord)
        join public.question_options o on o.id::text = r.k and o.question_id = p_question and o.correct_position = r.ord;
      if v_total > 0 then v_partial := v_inplace::numeric / v_total; end if;
    end if;
  end if;
  return jsonb_build_object('correct', v_partial = 1, 'partial', round(v_partial, 4));
end $$;

