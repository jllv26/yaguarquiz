-- =====================================================================
-- YaguarQuiz UAP — Fase 2: gestión académica
-- import_students(): importa/inscribe una lista completa en una sola transacción
-- save_grading_plan(): guarda el plan de calificación validando que sume 100
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

-- Normaliza un código (RU): sin espacios extremos, en mayúsculas
create or replace function public.normalize_code(t text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(btrim(coalesce(t, '')), '\s+', '', 'g')), '');
$$;

create or replace function public.import_students(
  p_subject_id uuid,
  p_rows jsonb,
  p_update_existing boolean default false
)
returns json language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  v_code text;
  v_last text;
  v_first text;
  v_student uuid;
  v_inserted boolean;
  n_created int := 0;
  n_existing int := 0;
  n_updated int := 0;
  n_enrolled int := 0;
  n_already int := 0;
  n_skipped int := 0;
begin
  if not public.is_teacher() then
    raise exception 'Solo un docente aprobado puede importar estudiantes';
  end if;
  if not public.owns('subjects', p_subject_id) then
    raise exception 'La asignatura no existe o no es tuya';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato de filas inválido';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_code  := public.normalize_code(r ->> 'university_code');
    v_last  := nullif(btrim(coalesce(r ->> 'last_names', '')), '');
    v_first := nullif(btrim(coalesce(r ->> 'first_names', '')), '');
    if v_code is null or v_last is null or v_first is null then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    v_student := null;
    if p_update_existing then
      insert into public.students (university_code, ci, last_names, first_names, email, career, active)
      values (v_code, nullif(btrim(r ->> 'ci'), ''), v_last, v_first,
              nullif(lower(btrim(r ->> 'email')), ''), nullif(btrim(r ->> 'career'), ''), true)
      on conflict (teacher_id, university_code) do update set
        ci          = coalesce(excluded.ci, public.students.ci),
        last_names  = excluded.last_names,
        first_names = excluded.first_names,
        email       = coalesce(excluded.email, public.students.email),
        career      = coalesce(excluded.career, public.students.career),
        active      = true
      returning id, (xmax = 0) into v_student, v_inserted;
      if v_inserted then n_created := n_created + 1; else n_updated := n_updated + 1; end if;
    else
      insert into public.students (university_code, ci, last_names, first_names, email, career)
      values (v_code, nullif(btrim(r ->> 'ci'), ''), v_last, v_first,
              nullif(lower(btrim(r ->> 'email')), ''), nullif(btrim(r ->> 'career'), ''))
      on conflict (teacher_id, university_code) do nothing
      returning id into v_student;
      if v_student is null then
        select s.id into v_student from public.students s
          where s.teacher_id = auth.uid() and s.university_code = v_code;
        n_existing := n_existing + 1;
      else
        n_created := n_created + 1;
      end if;
    end if;

    insert into public.enrollments (subject_id, student_id)
    values (p_subject_id, v_student)
    on conflict (subject_id, student_id) do nothing;
    if found then
      n_enrolled := n_enrolled + 1;
    else
      update public.enrollments set active = true
        where subject_id = p_subject_id and student_id = v_student;
      n_already := n_already + 1;
    end if;
  end loop;

  return json_build_object(
    'created', n_created, 'existing', n_existing, 'updated', n_updated,
    'enrolled', n_enrolled, 'already_enrolled', n_already, 'skipped', n_skipped
  );
end $$;

revoke all on function public.import_students(uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_students(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Plan de calificación
-- p_items: [{ "term": 1, "category": "Examen y pruebas escritas", "weight": 7, "source": "yaguarquiz" }, ...]
-- ---------------------------------------------------------------------
create or replace function public.save_grading_plan(
  p_subject_id uuid,
  p_pass_mark numeric,
  p_items jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_plan uuid;
  v_total numeric;
  v_max numeric := 100;
  v_keep uuid[] := '{}';
  v_id uuid;
  it jsonb;
  i int := 0;
begin
  if not public.is_teacher() then
    raise exception 'Solo un docente aprobado puede guardar el plan';
  end if;
  if not public.owns('subjects', p_subject_id) then
    raise exception 'La asignatura no existe o no es tuya';
  end if;

  select coalesce(sum((x ->> 'weight')::numeric), 0) into v_total
    from jsonb_array_elements(p_items) x;
  if v_total <> v_max then
    raise exception 'La suma de los puntos es %, debe ser exactamente %', v_total, v_max;
  end if;
  if p_pass_mark <= 0 or p_pass_mark > v_max then
    raise exception 'La nota de aprobación debe estar entre 1 y %', v_max;
  end if;

  insert into public.grading_plans (subject_id, pass_mark, max_score)
  values (p_subject_id, p_pass_mark, v_max)
  on conflict (subject_id) do update set pass_mark = excluded.pass_mark
  returning id into v_plan;

  for it in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    if coalesce(btrim(it ->> 'category'), '') = '' then
      raise exception 'Hay una categoría sin nombre';
    end if;
    insert into public.grading_items (plan_id, term, category, weight, source, sort_order)
    values (v_plan, (it ->> 'term')::int, btrim(it ->> 'category'), (it ->> 'weight')::numeric,
            coalesce(it ->> 'source', 'yaguarquiz'), i)
    on conflict (plan_id, term, category) do update set
      weight = excluded.weight, source = excluded.source, sort_order = excluded.sort_order
    returning id into v_id;
    v_keep := v_keep || v_id;
  end loop;

  delete from public.grading_items where plan_id = v_plan and not (id = any (v_keep));
  return v_plan;
end $$;

revoke all on function public.save_grading_plan(uuid, numeric, jsonb) from public, anon;
grant execute on function public.save_grading_plan(uuid, numeric, jsonb) to authenticated;

-- Un mismo docente no debe tener dos veces el mismo año, ni dos asignaturas
-- iguales (sigla + paralelo) en el mismo periodo
create unique index if not exists subjects_unique_parallel
  on public.subjects (period_id, upper(code), upper(parallel));
create unique index if not exists periods_unique_name
  on public.periods (academic_year_id, upper(name));
