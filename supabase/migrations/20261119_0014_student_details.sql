-- =====================================================================
-- YaguarQuiz UAP · 0014 · Todos los datos del estudiante
--   La lista oficial de la universidad trae: RU, CI, nombre, apellido paterno, apellido materno,
--   correo principal, correos adicionales, celular, dirección, grado académico y estado.
--   «apellidos» sigue siendo «paterno materno» (lo usa todo el sistema); además se guardan por separado.
-- =====================================================================

alter table public.students add column if not exists paternal_last_name text;
alter table public.students add column if not exists maternal_last_name text;
alter table public.students add column if not exists phone text;
alter table public.students add column if not exists extra_emails text;
alter table public.students add column if not exists address text;
alter table public.students add column if not exists degree text;
alter table public.students add column if not exists status_label text;

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
  v_active boolean;
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

    -- «Estado» de la lista oficial: ACTIVO (o vacío) = activo; INACTIVO, RETIRADO, ABANDONO… = inactivo
    v_active := coalesce(nullif(btrim(r ->> 'status_label'), ''), 'ACTIVO') !~* '^(inactiv|retir|abandon|baja|suspend)';
    v_student := null;
    if p_update_existing then
      insert into public.students (university_code, ci, last_names, first_names, email, career, active,
                                   paternal_last_name, maternal_last_name, phone, extra_emails, address, degree, status_label)
      values (v_code, nullif(btrim(r ->> 'ci'), ''), v_last, v_first,
              nullif(lower(btrim(r ->> 'email')), ''), nullif(btrim(r ->> 'career'), ''), v_active,
              nullif(btrim(r ->> 'paternal_last_name'), ''), nullif(btrim(r ->> 'maternal_last_name'), ''), nullif(btrim(r ->> 'phone'), ''), nullif(btrim(r ->> 'extra_emails'), ''), nullif(btrim(r ->> 'address'), ''), nullif(btrim(r ->> 'degree'), ''), nullif(btrim(r ->> 'status_label'), ''))
      on conflict (teacher_id, university_code) do update set
        ci          = coalesce(excluded.ci, public.students.ci),
        last_names  = excluded.last_names,
        first_names = excluded.first_names,
        email       = coalesce(excluded.email, public.students.email),
        career      = coalesce(excluded.career, public.students.career),
        active      = v_active,
        paternal_last_name = coalesce(excluded.paternal_last_name, public.students.paternal_last_name),
        maternal_last_name = coalesce(excluded.maternal_last_name, public.students.maternal_last_name),
        phone = coalesce(excluded.phone, public.students.phone),
        extra_emails = coalesce(excluded.extra_emails, public.students.extra_emails),
        address = coalesce(excluded.address, public.students.address),
        degree = coalesce(excluded.degree, public.students.degree),
        status_label = coalesce(excluded.status_label, public.students.status_label)
      returning id, (xmax = 0) into v_student, v_inserted;
      if v_inserted then n_created := n_created + 1; else n_updated := n_updated + 1; end if;
    else
      insert into public.students (university_code, ci, last_names, first_names, email, career, active,
                                   paternal_last_name, maternal_last_name, phone, extra_emails, address, degree, status_label)
      values (v_code, nullif(btrim(r ->> 'ci'), ''), v_last, v_first,
              nullif(lower(btrim(r ->> 'email')), ''), nullif(btrim(r ->> 'career'), ''), v_active,
              nullif(btrim(r ->> 'paternal_last_name'), ''), nullif(btrim(r ->> 'maternal_last_name'), ''), nullif(btrim(r ->> 'phone'), ''), nullif(btrim(r ->> 'extra_emails'), ''), nullif(btrim(r ->> 'address'), ''), nullif(btrim(r ->> 'degree'), ''), nullif(btrim(r ->> 'status_label'), ''))
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
